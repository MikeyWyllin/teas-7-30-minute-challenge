# TEAS 7 30-Minute Challenge

A static GitHub Pages practice app for TEAS 7 study.

## Features

- 250 original TEAS-style practice questions
- 25 random questions per test
- 30-minute countdown timer
- Subject selection screen
- Any subject combo: Reading, Math, Science, English
- Multiple choice, multi-select, and true/false question support
- Per-subject scoring after each test
- All-time stats saved in the user's browser with localStorage
- Shows the user's weakest subject based on saved attempts
- Same set code + same subjects = same test
- Export/copy results for ChatGPT review

## Deploy on GitHub Pages

1. Create a GitHub repo.
2. Upload these files directly to the root of the repo:
   - index.html
   - styles.css
   - app.js
   - questions.js
   - README.md
   - .nojekyll
3. Go to Settings > Pages.
4. Choose Deploy from a branch.
5. Select main and /root.
6. Save.

## Security note

This is a static practice app. The answer key is inside the browser files so the app can grade instantly. It is good for studying and sharing with friends, but it is not secure enough for official testing.
