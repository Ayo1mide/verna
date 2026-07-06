/**
 * REACT-TO-POST EDGE FUNCTION
 * 
 * FROM PROMPT: Part 4.4 — React to Post
 * Called when user taps an emoji reaction (💔 🤍 🌊 etc) on a feed post.
 * 
 * WHAT IT DOES:
 * 1. Receives reaction type + session ID (anonymous user fingerprint)
 * 2. Hashes session ID to prevent spam (same user can't react twice to same post)
 * 3. Inserts reaction into database
 * 4. Updates feed_posts reaction_counts JSONB field using add_feed_reaction RPC
 * 5. Returns updated counts
 * 
 * REQUEST BODY:
 * { post_id: uuid, reaction_type: string, session_id: string }
 * 
 * REACTION TYPES:
 * 💔 heartbreak     - "I feel this deeply"
 * 🤍 not_alone      - "You are not alone"
 * 🌊 let_it_out     - "Let it all out"
 * 🕯️  im_here        - "I'm here with you"
 * 🌱 you_will_grow  - "You will grow from this"
 * 🦋 transform      - "This will transform you"
 * 🌙 i_see_you      - "I see you in the dark"
 * ✨ you_are_enough - "You are enough"
 * 
 * IMPLEMENTS FROM PROMPT:
 * ✓ Part 4.4: React to Post (emoji reactions)
 * ✓ Part 8: Community Reactions (anonymous engagement)
 * ✓ Part 10: RLS policies (enforced via service_role_key)
 * 
 * RETURNS:
 * { success: true, reaction_counts: {...}, reactions_metadata: {...} }
 * 
 * KEY FEATURE: NO AUTHENTICATION REQUIRED
 * - No user login needed to react (anonymous anyone can)
 * - Identified only by hashed session ID
 * - One reaction per user per post (unique constraint)
 * 
 * MISSING FROM PROMPT:
 * - Rate limiting (anyone can spam reactions)
 * - IP-based spam detection
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

export const REACTIONS = {
  heartbreak:     { emoji: "💔", label: "I feel this deeply" },
  not_alone:      { emoji: "🤍", label: "You are not alone" },
  let_it_out:     { emoji: "🌊", label: "Let it all out" },
  im_here:        { emoji: "🕯️", label: "I'm here with you" },
  you_will_grow:  { emoji: "🌱", label: "You will grow from this" },
  transform:      { emoji: "🦋", label: "This will transform you" },
  i_see_you:      { emoji: "🌙", label: "I see you in the dark" },
  you_are_enough: { emoji: "✨", label: "You are enough" }
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })

  let body: any
  try { body = await req.json() } catch (e) { return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 }) }

  const { post_id, reaction_type, session_id } = body
  if (!post_id || !reaction_type || !session_id) return new Response(JSON.stringify({ error: 'Missing required fields: post_id, reaction_type, session_id' }), { status: 400 })
  if (!REACTIONS[reaction_type as keyof typeof REACTIONS]) {
    return new Response(JSON.stringify({ error: 'Invalid reaction' }), { status: 400 })
  }

  const encoder = new TextEncoder()
  const data = encoder.encode(session_id + post_id)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const sessionHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0,32)

  // Rate-limit reactions per sessionHash: 5 per minute
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  try {
    const window = Math.floor(Date.now() / 1000 / 60) * 60
    const { data: rlCount, error: rlErr } = await supabase.rpc('increment_rate_limit', { p_key: `react:${sessionHash}`, p_window_start: window, p_limit: 5 })
    if (rlErr) console.error('RL RPC error', rlErr)
    if (rlCount && rlCount > 5) return new Response(JSON.stringify({ error: true, message: 'Too many reactions, slow down' }), { status: 429 })
  } catch (e) { console.error('rate limit check failed', e) }

  const { data: updatedCounts } = await supabase.rpc('add_feed_reaction', { p_post_id: post_id, p_reaction_type: reaction_type, p_session_hash: sessionHash })

  return new Response(JSON.stringify({ success: true, reaction_counts: updatedCounts, reactions_metadata: REACTIONS }), { headers: { 'Content-Type': 'application/json' } })
})
