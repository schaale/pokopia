# Working with this repo

Solo project: Jake is the only maintainer and does not read or review code.
There are no other collaborators and no one will ever review a pull request
or comment on it.

- Don't open a draft PR and then wait for review/approval — there is no
  reviewer coming. Once a change is made and verified (tests pass, or the
  app was actually run/screenshotted per the `run` skill), merge it.
- This repo has no CI configured on pull requests (`.github/workflows/pages.yml`
  only triggers on push to `main`, to deploy to GitHub Pages). A PR sitting
  open is not "waiting for checks" — it's just waiting, for nothing.
- Prefer pushing straight to `main` for small/low-risk changes. For larger
  changes, a PR is fine, but merge it yourself once it's verified instead of
  leaving it open.
