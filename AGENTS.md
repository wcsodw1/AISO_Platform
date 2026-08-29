# Repository maintenance instructions

- Update the root `README.md` in the same commit whenever the repository structure, product catalog, version, dependencies, commands, publishing flow, or tracked/ignored data policy changes.
- Keep the architecture tree and folder-purpose table aligned with the actual repository.
- Run `make check` after code changes and `make export` after Portal data or public-file changes.
- Never commit credentials, tokens, private keys, `.env` files, raw benchmark stdout/stderr, JSONL trials, browser-saved pages, or `AISO_Platform_Portal/Previous data/`.
- Do not change repository visibility or push to a different remote without explicit approval.
