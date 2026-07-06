/**
 * ANALYZE-ENTRY EDGE FUNCTION
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.21.0"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, requireUser, serviceClient } from "../_shared/auth.ts"

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! })

serve(async (req) => {
  try {
    const early = assertPost(req)
    if (early) return early
    const authUser = await requireUser(req)

    let body: any
    try { body = await req.json() } catch (e) { return json({ error: true, message: 'Invalid JSON body' }, 400) }

    const schema = z.object({ entry_id: z.string().uuid(), journal_id: z.string().uuid(), user_id: z.string().uuid().optional() })
    const parsed = schema.safeParse(body)
    if (!parsed.success) return json({ error: true, message: 'Invalid request body', details: parsed.error.flatten() }, 400)
    const { entry_id, journal_id } = parsed.data
    const user_id = authUser.id

    if (parsed.data.user_id && parsed.data.user_id !== user_id) return json({ error: true, message: "Token does not match requested user" }, 403)

    const supabase = serviceClient()

    // Rate-limit: 100 AI analyzes per hour per user
    try {
      const window = Math.floor(Date.now() / 1000 / 3600) * 3600
      const { data: rlCount, error: rlErr } = await supabase.rpc('increment_rate_limit', { p_key: `ai:analyze:${user_id}`, p_window_start: window, p_limit: 100 })
      if (rlErr) console.error('RL RPC error', rlErr)
      if (rlCount && rlCount > 100) return json({ error: true, message: 'Rate limit exceeded' }, 429)
    } catch (e) { console.error('rate limit check failed', e) }

    // 1. Read the journal entry
    const { data: entry } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("id", entry_id)
      .eq("journal_id", journal_id)
      .eq("user_id", user_id)
      .single()

    if (!entry) return json({ error: true, message: 'Entry not found' }, 404)

    // 2. IMPROVED PROMPT — honest coach, not a cheerleader
    // Tackles Reddit concerns: challenges one-sided narratives,
    // asks real questions, surfaces blind spots, no clichés
    const analysisPrompt = `You are a grounded, honest emotional coach — not a cheerleader.

A person just wrote this journal entry. Read it carefully.

ENTRY:
Mood: ${entry.mood} (${entry.mood_score}/10)
Trigger: ${entry.trigger || 'not specified'}
Content: "${entry.content}"

Your job is to:
1. Understand what they actually felt — including contradictions
2. Notice if they are placing ALL blame on others or avoiding their own role — if so, gently name it without judgment
3. Identify the real emotional pattern, not just the surface mood
4. Give ONE honest insight that is useful, not just comforting
5. Ask ONE honest question at the end of ai_insight that challenges them to go deeper — not a soft question, a real one
6. Never use clichés like "you are enough", "be kind to yourself", "storms pass", "you've got this"
7. If something they wrote could be seen from another perspective, name it briefly

Return ONLY a valid JSON object with NO markdown, NO explanation:
{
  "sentiment_score": <float -1.0 to 1.0>,
  "dominant_emotion": "<the most honest primary emotion, not just what they labelled it>",
  "top_trigger": "<the real pattern or trigger you see in the content>",
  "ai_insight": "<2-3 sentences of honest, grounded insight. End with one real question that makes them think deeper.>",
  "blind_spot": "<one thing they might not be seeing clearly, or null if not applicable>",
  "pattern_insight": "<what this entry reveals about a recurring theme>",
  "growth_signal": "<one specific thing showing genuine progress or self-awareness, not generic praise>"
}`

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: analysisPrompt }]
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : '{}'
    let analysis: any = {}
    try { 
      analysis = JSON.parse(rawText.replace(/```json|```/g, '').trim()) 
    } catch(e) { 
      analysis = { sentiment_score: 0, dominant_emotion: null, top_trigger: null, ai_insight: null, blind_spot: null, pattern_insight: null, growth_signal: null } 
    }

    // 3. Update journal_entries with analysis
    await supabase
      .from("journal_entries")
      .update({ sentiment_score: analysis.sentiment_score, ai_insight: analysis.ai_insight })
      .eq("id", entry_id)
      .eq("user_id", user_id)

    // 4. Get entry count and update journal
    const { data: entries } = await supabase
      .from("journal_entries")
      .select("mood_score")
      .eq("journal_id", journal_id)
      .eq("user_id", user_id)

    const entryCount = entries?.length || 0
    const avgMood = entries ? entries.reduce((a: any, e: any) => a + e.mood_score, 0) / entries.length : 0

    await supabase
      .from("journals")
      .update({ entry_count: entryCount, dominant_mood: analysis.dominant_emotion || "hopeful" })
      .eq("id", journal_id)
      .eq("user_id", user_id)

    // 5. AWARD MILESTONES
    const milestonesAwarded: string[] = []

    if (entryCount === 1) {
      await supabase.rpc("award_milestone", { p_user_id: user_id, p_journal_id: journal_id, p_type: "first_entry", p_title: "First Step", p_description: "You wrote your first journal entry!", p_icon: "📝" })
      milestonesAwarded.push("first_entry")
    }

    if (entryCount === 10) {
      await supabase.rpc("award_milestone", { p_user_id: user_id, p_journal_id: journal_id, p_type: "ten_entries", p_title: "Finding Your Voice", p_description: "10 journal entries! You're building a powerful practice.", p_icon: "🎯" })
      milestonesAwarded.push("ten_entries")
    }

    if (avgMood >= 7.0) {
      await supabase.rpc("award_milestone", { p_user_id: user_id, p_journal_id: journal_id, p_type: "mood_improved_50", p_title: "Brighter Days", p_description: "Your mood is averaging 7+/10 — significant improvement!", p_icon: "☀️" })
      milestonesAwarded.push("mood_improved_50")
    }

    // 6. TRACK WEEKLY GROWTH
    const now = new Date()
    const weekNumber = Math.floor((now.getDate() - now.getDay() + 6) / 7)
    const year = now.getFullYear()

    const { data: prevWeek } = await supabase
      .from("growth_tracking")
      .select("avg_mood_score")
      .eq("journal_id", journal_id)
      .eq("week_number", weekNumber - 1)
      .eq("year", year)
      .single()

    const growthDelta = prevWeek ? ((avgMood - prevWeek.avg_mood_score) / prevWeek.avg_mood_score) * 100 : 0

    await supabase
      .from("growth_tracking")
      .upsert({ journal_id, user_id, week_number: weekNumber, year, avg_mood_score: avgMood, dominant_emotion: analysis.dominant_emotion, top_trigger: analysis.top_trigger, pattern_insight: analysis.pattern_insight, growth_delta: growthDelta }, { onConflict: "journal_id,week_number,year" })

    return json({
      success: true,
      analysis,
      entry_count: entryCount,
      milestones_awarded: milestonesAwarded,
      weekly_growth: { week_number: weekNumber, avg_mood_score: avgMood, growth_delta: growthDelta, pattern_insight: analysis.pattern_insight }
    })

  } catch (err: any) {
    return handleError("analyze-entry", err);
  }
})
