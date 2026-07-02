# ELP §1 interview prompt audio

The mp3 files referenced by `apps/web/app/app/elp/prompts.ts` (`INTERVIEW_PROMPTS[].audioSrc`)
are generated, not hand-authored. Run the author-side script to (re)generate them from the
prompt `text`:

```bash
cd apps/web
ELEVENLABS_API_KEY=... npx tsx scripts/generate-elp-prompts.ts
```

This writes one `<id>.mp3` per entry in `INTERVIEW_PROMPTS` into this directory. The generated
files are committed to the repo separately (binary assets are not produced by this task) —
this directory exists so the app's `public/` asset path resolves once they land.
