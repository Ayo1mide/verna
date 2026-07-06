/*
 * Simple Node script to exercise the Verna backend endpoints
 */

import { createClient } from '@supabase/supabase-js';

(async () => {
  try {
    const d = await import('dotenv');
    d.config({ path: './backend/supabase/.env.local' });
  } catch (e) {}

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    console.log('creating test user');
    const email = `user${Date.now()}@example.com`;
    const password = 'Test123!';

    let { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) console.warn('signup error', signUpError.message);

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    const jwt = signInData.session?.access_token;
    console.log('logged in, jwt length', jwt?.length);

    await supabase.auth.setSession({
      access_token: jwt!,
      refresh_token: signInData.session?.refresh_token!
    });

    // create a journal
    const { data: journal, error: journalError } = await supabase
      .from('journals')
      .insert({ user_id: signInData.user?.id, title: 'Test Journal' })
      .select()
      .single();
    console.log('journal error', journalError);
    console.log('journal', journal);

    if (!journal) {
      console.error('Could not create journal — check RLS policies on journals table');
      process.exit(1);
    }

    // create entry
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .insert({ journal_id: journal.id, user_id: journal.user_id, mood_score: 5, mood: 'neutral', content: 'Hello from test script' })
      .select()
      .single();
    console.log('entry error', entryError);
    console.log('entry', entry);

    if (!entry) {
      console.error('Could not create entry — check RLS policies on journal_entries table');
      process.exit(1);
    }

    // call analyze-entry function
    console.log('calling analyze-entry...');
    const analysisResp = await fetch(`${SUPABASE_URL}/functions/v1/analyze-entry`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ entry_id: entry.id, journal_id: journal.id, user_id: journal.user_id })
    });
    console.log('analyze-entry status:', analysisResp.status);
    const analysis = await analysisResp.json();
    console.log('analysis result', JSON.stringify(analysis, null, 2));

  } catch (e) {
    console.error(e);
    process.exit(1);
  }

})();
