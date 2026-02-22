help:
	cat Makefile

run:
	pnpm node index.mts

compile-to-js:
	# Prerequisites:
	# brew install pnpm
	# pnpm setup
	# source ~/.zshrc
	# pnpm add -g typescript
	tsc scalefx.mts --target es2024
