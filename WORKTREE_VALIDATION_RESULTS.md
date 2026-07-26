# npm-vuln-patcher worktree validation results

Date: 2026-07-26

All tests ran in detached Git worktrees without modifying the original repositories. The GitHub Spec Kit frontend was entirely untracked, so its worktree used an unreferenced local snapshot commit created with a temporary Git index; the source branch and working files remained unchanged. Durations are wall-clock time for the final accepted patcher run, not earlier diagnostic or rollback attempts.

## Results summary

| Repository | Baseline audit | Final audit | High + critical fixed | All-severity net fixed | Final patcher run |
| --- | ---: | ---: | ---: | ---: | ---: |
| hashtag-scraper | 77 (C7/H32/M24/L14) | 75 (C4/H32/M25/L14) | 3 | 2 | 67s |
| scaffold-app | 27 (C1/H15/M8/L3) | 3 (C0/H0/M3/L0) | 16 | 24 | 33s |
| github-spec-kit-demo/frontend | 21 (C2/H11/M7/L1) | 6 (C1/H1/M3/L1) | 11 | 15 | 29s |
| themambaleague.com/frontend | 18 (C0/H10/M7/L1) | 17 (C0/H9/M7/L1) | 1 | 1 | 101s |

Counts are npm audit vulnerable-package entries. A severity change can therefore move a finding between columns without changing the package-entry count.

## hashtag-scraper

- Source: `/Users/yandre/workspace/hashtag-scraper`
- Worktree: `/Users/yandre/workspace/hashtag-scraper-npm-vuln-patcher-test`
- Detached commit: `d8321c225982c9dcc158f8a7596ae16facce22ce`
- Outcome: Committed partial improvement; unresolved findings remain (exit code 2).
- Duration: **67 seconds**
- Vulnerabilities: 77 → 75 total; critical 7 → 4; high 32 → 32; moderate 24 → 25; low 14 → 14.
- Command: `npm-vuln-patcher --apply --severity high --timeout-ms 30000 --max-fixpoint-passes 1 --max-resolver-attempts-per-group 3 --test "npm run build" --format json`
- Note: The accepted patch added `overrides` for `@babel/traverse@7.29.7` and `form-data@4.0.6`. No direct dependency spec changed.

### Independent validation

- Fresh `npm ci`: passed.
- `npm run build`: passed.
- Final `npm audit --json`: 4 critical, 32 high, 25 moderate, 14 low.
- The repository baseline test is already failing: `src/App.test.js` expects “learn react,” which the committed app does not render. The patcher run therefore used the passing production build as its verification command.

### Direct manifest version changes

No direct dependency or devDependency version spec changed.

### All lockfile package upgrades (15)

| Package | Before | After | Lockfile location |
| --- | --- | --- | --- |
| `@babel/code-frame` | `7.18.6` | `7.29.7` | `node_modules/@babel/code-frame` |
| `@babel/generator` | `7.19.0` | `7.29.7` | `node_modules/@babel/generator` |
| `@jridgewell/gen-mapping` | `0.3.2` | `0.3.13` | `node_modules/@babel/generator/node_modules/@jridgewell/gen-mapping` |
| `@babel/helper-string-parser` | `7.18.10` | `7.29.7` | `node_modules/@babel/helper-string-parser` |
| `@babel/helper-validator-identifier` | `7.19.1` | `7.29.7` | `node_modules/@babel/helper-validator-identifier` |
| `@babel/parser` | `7.19.1` | `7.29.7` | `node_modules/@babel/parser` |
| `@babel/template` | `7.18.10` | `7.29.7` | `node_modules/@babel/template` |
| `@babel/traverse` | `7.19.1` | `7.29.7` | `node_modules/@babel/traverse` |
| `@babel/types` | `7.19.0` | `7.29.7` | `node_modules/@babel/types` |
| `@jridgewell/sourcemap-codec` | `1.4.14` | `1.5.5` | `node_modules/@jridgewell/sourcemap-codec` |
| `@jridgewell/trace-mapping` | `0.3.15` | `0.3.31` | `node_modules/@jridgewell/trace-mapping` |
| `form-data` | `4.0.4` | `4.0.6` | `node_modules/form-data` |
| `hasown` | `2.0.2` | `2.0.4` | `node_modules/hasown` |
| `jsesc` | `2.5.2` | `3.1.0` | `node_modules/jsesc` |
| `picocolors` | `1.0.0` | `1.1.1` | `node_modules/picocolors` |

### Lockfile graph additions (1)

These are newly selected graph nodes, not upgrades from an existing version.

| Package | Version | Lockfile location |
| --- | --- | --- |
| `@babel/helper-globals` | `7.29.7` | `node_modules/@babel/helper-globals` |

### Lockfile graph removals (4)

| Package | Former version | Former lockfile location |
| --- | --- | --- |
| `@babel/highlight` | `7.18.6` | `node_modules/@babel/highlight` |
| `form-data` | `3.0.4` | `node_modules/jest-environment-jsdom/node_modules/form-data` |
| `form-data` | `2.3.3` | `node_modules/request/node_modules/form-data` |
| `to-fast-properties` | `2.0.0` | `node_modules/to-fast-properties` |

## scaffold-app

- Source: `/Users/yandre/workspace/test/angular-21/scaffold-app`
- Worktree: `/Users/yandre/workspace/test/angular-21/scaffold-app-npm-vuln-patcher-test`
- Detached commit: `3ff656c12867356e93c5094819a9c5734ebd5594`
- Outcome: Committed complete high/critical cleanup (exit code 0).
- Duration: **33 seconds**
- Vulnerabilities: 27 → 3 total; critical 1 → 0; high 15 → 0; moderate 8 → 3; low 3 → 0.
- Command: `npm-vuln-patcher --apply --severity high --timeout-ms 30000 --test "npm test -- --watch=false && npm run build" --format json`
- Note: The controlled fresh-lock fallback re-resolved the dependency graph. This is why the lockfile contains substantially more upgrades than the seven direct Angular manifest changes.

### Independent validation

- Fresh `npm ci`: passed.
- `npm test -- --watch=false`: passed (2/2 tests).
- `npm run build`: passed.
- `prettier --check package.json package-lock.json`: passed.
- Final `npm audit --json`: 0 critical, 0 high, 3 moderate, 0 low.

### Direct manifest version changes

| Section | Package | Before | After |
| --- | --- | --- | --- |
| dependencies | `@angular/common` | `^21.2.0` | `^21.2.18` |
| dependencies | `@angular/compiler` | `^21.2.0` | `^21.2.18` |
| dependencies | `@angular/core` | `^21.2.0` | `^21.2.18` |
| dependencies | `@angular/forms` | `^21.2.0` | `^21.2.18` |
| dependencies | `@angular/platform-browser` | `^21.2.0` | `^21.2.18` |
| dependencies | `@angular/router` | `^21.2.0` | `^21.2.18` |
| devDependencies | `@angular/build` | `^21.2.5` | `^21.2.19` |

### All lockfile package upgrades (190)

| Package | Before | After | Lockfile location |
| --- | --- | --- | --- |
| `@angular-devkit/architect` | `0.2102.5` | `0.2102.19` | `node_modules/@angular-devkit/architect` |
| `@angular-devkit/core` | `21.2.5` | `21.2.19` | `node_modules/@angular-devkit/core` |
| `@angular-devkit/schematics` | `21.2.5` | `21.2.19` | `node_modules/@angular-devkit/schematics` |
| `@angular/build` | `21.2.5` | `21.2.19` | `node_modules/@angular/build` |
| `@angular/cli` | `21.2.5` | `21.2.19` | `node_modules/@angular/cli` |
| `@angular/common` | `21.2.6` | `21.2.18` | `node_modules/@angular/common` |
| `@angular/compiler` | `21.2.6` | `21.2.18` | `node_modules/@angular/compiler` |
| `@angular/compiler-cli` | `21.2.6` | `21.2.18` | `node_modules/@angular/compiler-cli` |
| `@angular/core` | `21.2.6` | `21.2.18` | `node_modules/@angular/core` |
| `@angular/forms` | `21.2.6` | `21.2.18` | `node_modules/@angular/forms` |
| `@angular/platform-browser` | `21.2.6` | `21.2.18` | `node_modules/@angular/platform-browser` |
| `@angular/router` | `21.2.6` | `21.2.18` | `node_modules/@angular/router` |
| `@asamuzakjp/css-color` | `5.1.1` | `5.1.11` | `node_modules/@asamuzakjp/css-color` |
| `lru-cache` | `11.2.7` | `11.5.2` | `node_modules/@asamuzakjp/dom-selector/node_modules/lru-cache` |
| `@babel/code-frame` | `7.29.0` | `7.29.7` | `node_modules/@babel/code-frame` |
| `@babel/compat-data` | `7.29.0` | `7.29.7` | `node_modules/@babel/compat-data` |
| `@babel/core` | `7.29.0` | `7.29.7` | `node_modules/@babel/core` |
| `@babel/generator` | `7.29.1` | `7.29.7` | `node_modules/@babel/generator` |
| `@babel/helper-compilation-targets` | `7.28.6` | `7.29.7` | `node_modules/@babel/helper-compilation-targets` |
| `@babel/helper-globals` | `7.28.0` | `7.29.7` | `node_modules/@babel/helper-globals` |
| `@babel/helper-module-imports` | `7.28.6` | `7.29.7` | `node_modules/@babel/helper-module-imports` |
| `@babel/helper-module-transforms` | `7.28.6` | `7.29.7` | `node_modules/@babel/helper-module-transforms` |
| `@babel/helper-string-parser` | `7.27.1` | `7.29.7` | `node_modules/@babel/helper-string-parser` |
| `@babel/helper-validator-identifier` | `7.28.5` | `7.29.7` | `node_modules/@babel/helper-validator-identifier` |
| `@babel/helper-validator-option` | `7.27.1` | `7.29.7` | `node_modules/@babel/helper-validator-option` |
| `@babel/helpers` | `7.29.2` | `7.29.7` | `node_modules/@babel/helpers` |
| `@babel/parser` | `7.29.2` | `7.29.7` | `node_modules/@babel/parser` |
| `@babel/template` | `7.28.6` | `7.29.7` | `node_modules/@babel/template` |
| `@babel/traverse` | `7.29.0` | `7.29.7` | `node_modules/@babel/traverse` |
| `@babel/types` | `7.29.0` | `7.29.7` | `node_modules/@babel/types` |
| `@csstools/color-helpers` | `6.0.2` | `6.1.0` | `node_modules/@csstools/color-helpers` |
| `@csstools/css-calc` | `3.1.1` | `3.3.0` | `node_modules/@csstools/css-calc` |
| `@csstools/css-color-parser` | `4.0.2` | `4.1.10` | `node_modules/@csstools/css-color-parser` |
| `@csstools/css-syntax-patches-for-csstree` | `1.1.2` | `1.1.7` | `node_modules/@csstools/css-syntax-patches-for-csstree` |
| `@emnapi/core` | `1.9.1` | `1.11.3` | `node_modules/@emnapi/core` |
| `@emnapi/runtime` | `1.9.1` | `1.11.3` | `node_modules/@emnapi/runtime` |
| `@emnapi/wasi-threads` | `1.2.0` | `1.2.3` | `node_modules/@emnapi/wasi-threads` |
| `@esbuild/aix-ppc64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/aix-ppc64` |
| `@esbuild/android-arm` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/android-arm` |
| `@esbuild/android-arm64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/android-arm64` |
| `@esbuild/android-x64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/android-x64` |
| `@esbuild/darwin-arm64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/darwin-arm64` |
| `@esbuild/darwin-x64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/darwin-x64` |
| `@esbuild/freebsd-arm64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/freebsd-arm64` |
| `@esbuild/freebsd-x64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/freebsd-x64` |
| `@esbuild/linux-arm` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/linux-arm` |
| `@esbuild/linux-arm64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/linux-arm64` |
| `@esbuild/linux-ia32` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/linux-ia32` |
| `@esbuild/linux-loong64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/linux-loong64` |
| `@esbuild/linux-mips64el` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/linux-mips64el` |
| `@esbuild/linux-ppc64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/linux-ppc64` |
| `@esbuild/linux-riscv64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/linux-riscv64` |
| `@esbuild/linux-s390x` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/linux-s390x` |
| `@esbuild/linux-x64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/linux-x64` |
| `@esbuild/netbsd-arm64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/netbsd-arm64` |
| `@esbuild/netbsd-x64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/netbsd-x64` |
| `@esbuild/openbsd-arm64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/openbsd-arm64` |
| `@esbuild/openbsd-x64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/openbsd-x64` |
| `@esbuild/openharmony-arm64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/openharmony-arm64` |
| `@esbuild/sunos-x64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/sunos-x64` |
| `@esbuild/win32-arm64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/win32-arm64` |
| `@esbuild/win32-ia32` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/win32-ia32` |
| `@esbuild/win32-x64` | `0.27.3` | `0.28.1` | `node_modules/@esbuild/win32-x64` |
| `@exodus/bytes` | `1.15.0` | `1.15.1` | `node_modules/@exodus/bytes` |
| `@hono/node-server` | `1.19.12` | `1.19.15` | `node_modules/@hono/node-server` |
| `@istanbuljs/schema` | `0.1.3` | `0.1.6` | `node_modules/@istanbuljs/schema` |
| `@msgpackr-extract/msgpackr-extract-darwin-arm64` | `3.0.3` | `3.0.4` | `node_modules/@msgpackr-extract/msgpackr-extract-darwin-arm64` |
| `@msgpackr-extract/msgpackr-extract-darwin-x64` | `3.0.3` | `3.0.4` | `node_modules/@msgpackr-extract/msgpackr-extract-darwin-x64` |
| `@msgpackr-extract/msgpackr-extract-linux-arm` | `3.0.3` | `3.0.4` | `node_modules/@msgpackr-extract/msgpackr-extract-linux-arm` |
| `@msgpackr-extract/msgpackr-extract-linux-arm64` | `3.0.3` | `3.0.4` | `node_modules/@msgpackr-extract/msgpackr-extract-linux-arm64` |
| `@msgpackr-extract/msgpackr-extract-linux-x64` | `3.0.3` | `3.0.4` | `node_modules/@msgpackr-extract/msgpackr-extract-linux-x64` |
| `@msgpackr-extract/msgpackr-extract-win32-x64` | `3.0.3` | `3.0.4` | `node_modules/@msgpackr-extract/msgpackr-extract-win32-x64` |
| `@napi-rs/wasm-runtime` | `1.1.2` | `1.1.6` | `node_modules/@napi-rs/wasm-runtime` |
| `@npmcli/agent` | `4.0.0` | `4.0.2` | `node_modules/@npmcli/agent` |
| `lru-cache` | `11.2.7` | `11.5.2` | `node_modules/@npmcli/agent/node_modules/lru-cache` |
| `lru-cache` | `11.2.7` | `11.5.2` | `node_modules/@npmcli/git/node_modules/lru-cache` |
| `@parcel/watcher` | `2.5.6` | `2.6.0` | `node_modules/@parcel/watcher` |
| `@parcel/watcher-android-arm64` | `2.5.6` | `2.6.0` | `node_modules/@parcel/watcher-android-arm64` |
| `@parcel/watcher-darwin-arm64` | `2.5.6` | `2.6.0` | `node_modules/@parcel/watcher-darwin-arm64` |
| `@parcel/watcher-darwin-x64` | `2.5.6` | `2.6.0` | `node_modules/@parcel/watcher-darwin-x64` |
| `@parcel/watcher-freebsd-x64` | `2.5.6` | `2.6.0` | `node_modules/@parcel/watcher-freebsd-x64` |
| `@parcel/watcher-linux-arm-glibc` | `2.5.6` | `2.6.0` | `node_modules/@parcel/watcher-linux-arm-glibc` |
| `@parcel/watcher-linux-arm-musl` | `2.5.6` | `2.6.0` | `node_modules/@parcel/watcher-linux-arm-musl` |
| `@parcel/watcher-linux-arm64-glibc` | `2.5.6` | `2.6.0` | `node_modules/@parcel/watcher-linux-arm64-glibc` |
| `@parcel/watcher-linux-arm64-musl` | `2.5.6` | `2.6.0` | `node_modules/@parcel/watcher-linux-arm64-musl` |
| `@parcel/watcher-linux-x64-glibc` | `2.5.6` | `2.6.0` | `node_modules/@parcel/watcher-linux-x64-glibc` |
| `@parcel/watcher-linux-x64-musl` | `2.5.6` | `2.6.0` | `node_modules/@parcel/watcher-linux-x64-musl` |
| `@parcel/watcher-win32-arm64` | `2.5.6` | `2.6.0` | `node_modules/@parcel/watcher-win32-arm64` |
| `@parcel/watcher-win32-x64` | `2.5.6` | `2.6.0` | `node_modules/@parcel/watcher-win32-x64` |
| `@rollup/rollup-android-arm-eabi` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-android-arm-eabi` |
| `@rollup/rollup-android-arm64` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-android-arm64` |
| `@rollup/rollup-darwin-arm64` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-darwin-arm64` |
| `@rollup/rollup-darwin-x64` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-darwin-x64` |
| `@rollup/rollup-freebsd-arm64` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-freebsd-arm64` |
| `@rollup/rollup-freebsd-x64` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-freebsd-x64` |
| `@rollup/rollup-linux-arm-gnueabihf` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-linux-arm-gnueabihf` |
| `@rollup/rollup-linux-arm-musleabihf` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-linux-arm-musleabihf` |
| `@rollup/rollup-linux-arm64-gnu` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-linux-arm64-gnu` |
| `@rollup/rollup-linux-arm64-musl` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-linux-arm64-musl` |
| `@rollup/rollup-linux-loong64-gnu` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-linux-loong64-gnu` |
| `@rollup/rollup-linux-loong64-musl` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-linux-loong64-musl` |
| `@rollup/rollup-linux-ppc64-gnu` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-linux-ppc64-gnu` |
| `@rollup/rollup-linux-ppc64-musl` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-linux-ppc64-musl` |
| `@rollup/rollup-linux-riscv64-gnu` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-linux-riscv64-gnu` |
| `@rollup/rollup-linux-riscv64-musl` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-linux-riscv64-musl` |
| `@rollup/rollup-linux-s390x-gnu` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-linux-s390x-gnu` |
| `@rollup/rollup-linux-x64-gnu` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-linux-x64-gnu` |
| `@rollup/rollup-linux-x64-musl` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-linux-x64-musl` |
| `@rollup/rollup-openbsd-x64` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-openbsd-x64` |
| `@rollup/rollup-openharmony-arm64` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-openharmony-arm64` |
| `@rollup/rollup-win32-arm64-msvc` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-win32-arm64-msvc` |
| `@rollup/rollup-win32-ia32-msvc` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-win32-ia32-msvc` |
| `@rollup/rollup-win32-x64-gnu` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-win32-x64-gnu` |
| `@rollup/rollup-win32-x64-msvc` | `4.60.1` | `4.62.3` | `node_modules/@rollup/rollup-win32-x64-msvc` |
| `@schematics/angular` | `21.2.5` | `21.2.19` | `node_modules/@schematics/angular` |
| `@sigstore/core` | `3.2.0` | `3.2.1` | `node_modules/@sigstore/core` |
| `@sigstore/protobuf-specs` | `0.5.0` | `0.5.1` | `node_modules/@sigstore/protobuf-specs` |
| `@sigstore/verify` | `3.1.0` | `3.1.1` | `node_modules/@sigstore/verify` |
| `@tybys/wasm-util` | `0.10.1` | `0.10.3` | `node_modules/@tybys/wasm-util` |
| `@types/estree` | `1.0.8` | `1.0.9` | `node_modules/@types/estree` |
| `@vitest/expect` | `4.1.2` | `4.1.10` | `node_modules/@vitest/expect` |
| `@vitest/mocker` | `4.1.2` | `4.1.10` | `node_modules/@vitest/mocker` |
| `@vitest/pretty-format` | `4.1.2` | `4.1.10` | `node_modules/@vitest/pretty-format` |
| `@vitest/runner` | `4.1.2` | `4.1.10` | `node_modules/@vitest/runner` |
| `@vitest/snapshot` | `4.1.2` | `4.1.10` | `node_modules/@vitest/snapshot` |
| `@vitest/spy` | `4.1.2` | `4.1.10` | `node_modules/@vitest/spy` |
| `@vitest/utils` | `4.1.2` | `4.1.10` | `node_modules/@vitest/utils` |
| `baseline-browser-mapping` | `2.10.12` | `2.11.4` | `node_modules/baseline-browser-mapping` |
| `body-parser` | `2.2.2` | `2.3.0` | `node_modules/body-parser` |
| `brace-expansion` | `5.0.5` | `5.0.8` | `node_modules/brace-expansion` |
| `browserslist` | `4.28.1` | `4.28.7` | `node_modules/browserslist` |
| `lru-cache` | `11.2.7` | `11.5.2` | `node_modules/cacache/node_modules/lru-cache` |
| `caniuse-lite` | `1.0.30001782` | `1.0.30001806` | `node_modules/caniuse-lite` |
| `chardet` | `2.1.1` | `2.2.0` | `node_modules/chardet` |
| `content-disposition` | `1.0.1` | `1.1.0` | `node_modules/content-disposition` |
| `lru-cache` | `11.2.7` | `11.5.2` | `node_modules/cssstyle/node_modules/lru-cache` |
| `electron-to-chromium` | `1.5.329` | `1.5.396` | `node_modules/electron-to-chromium` |
| `es-module-lexer` | `2.0.0` | `2.3.1` | `node_modules/es-module-lexer` |
| `es-object-atoms` | `1.1.1` | `1.1.2` | `node_modules/es-object-atoms` |
| `esbuild` | `0.27.3` | `0.28.1` | `node_modules/esbuild` |
| `eventsource-parser` | `3.0.6` | `3.1.0` | `node_modules/eventsource-parser` |
| `expect-type` | `1.3.0` | `1.4.0` | `node_modules/expect-type` |
| `express-rate-limit` | `8.3.2` | `8.6.0` | `node_modules/express-rate-limit` |
| `fast-uri` | `3.1.0` | `3.1.4` | `node_modules/fast-uri` |
| `get-east-asian-width` | `1.5.0` | `1.6.0` | `node_modules/get-east-asian-width` |
| `hasown` | `2.0.2` | `2.0.4` | `node_modules/hasown` |
| `hono` | `4.12.9` | `4.12.32` | `node_modules/hono` |
| `hosted-git-info` | `9.0.2` | `9.0.3` | `node_modules/hosted-git-info` |
| `lru-cache` | `11.2.7` | `11.5.2` | `node_modules/hosted-git-info/node_modules/lru-cache` |
| `iconv-lite` | `0.7.2` | `0.7.3` | `node_modules/iconv-lite` |
| `immutable` | `5.1.5` | `5.1.9` | `node_modules/immutable` |
| `ip-address` | `10.1.0` | `10.3.1` | `node_modules/ip-address` |
| `jose` | `6.2.2` | `6.2.4` | `node_modules/jose` |
| `make-fetch-happen` | `15.0.5` | `15.0.6` | `node_modules/make-fetch-happen` |
| `media-typer` | `1.1.0` | `1.1.1` | `node_modules/media-typer` |
| `msgpackr` | `1.11.9` | `1.12.1` | `node_modules/msgpackr` |
| `msgpackr-extract` | `3.0.3` | `3.0.4` | `node_modules/msgpackr-extract` |
| `nanoid` | `3.3.11` | `3.3.16` | `node_modules/nanoid` |
| `node-gyp` | `12.2.0` | `12.4.0` | `node_modules/node-gyp` |
| `node-releases` | `2.0.36` | `2.0.51` | `node_modules/node-releases` |
| `obug` | `2.1.1` | `2.1.4` | `node_modules/obug` |
| `p-map` | `7.0.4` | `7.0.6` | `node_modules/p-map` |
| `pacote` | `21.3.1` | `21.5.1` | `node_modules/pacote` |
| `parse5` | `8.0.0` | `8.0.1` | `node_modules/parse5` |
| `entities` | `6.0.1` | `8.0.0` | `node_modules/parse5/node_modules/entities` |
| `lru-cache` | `11.2.7` | `11.5.2` | `node_modules/path-scurry/node_modules/lru-cache` |
| `path-to-regexp` | `8.4.1` | `8.4.2` | `node_modules/path-to-regexp` |
| `piscina` | `5.1.4` | `5.2.0` | `node_modules/piscina` |
| `postcss` | `8.5.8` | `8.5.23` | `node_modules/postcss` |
| `prettier` | `3.8.1` | `3.9.6` | `node_modules/prettier` |
| `qs` | `6.15.0` | `6.15.3` | `node_modules/qs` |
| `range-parser` | `1.2.1` | `1.3.0` | `node_modules/range-parser` |
| `rollup` | `4.60.1` | `4.62.3` | `node_modules/rollup` |
| `side-channel` | `1.1.0` | `1.1.1` | `node_modules/side-channel` |
| `side-channel-list` | `1.0.0` | `1.0.1` | `node_modules/side-channel-list` |
| `sigstore` | `4.1.0` | `4.1.1` | `node_modules/sigstore` |
| `socks` | `2.8.7` | `2.8.9` | `node_modules/socks` |
| `std-env` | `4.0.0` | `4.2.0` | `node_modules/std-env` |
| `stdin-discarder` | `0.3.1` | `0.3.2` | `node_modules/stdin-discarder` |
| `string-width` | `8.2.0` | `8.2.2` | `node_modules/string-width` |
| `tar` | `7.5.13` | `7.5.22` | `node_modules/tar` |
| `tinyexec` | `1.0.4` | `1.2.4` | `node_modules/tinyexec` |
| `tldts` | `7.0.27` | `7.4.9` | `node_modules/tldts` |
| `tldts-core` | `7.0.27` | `7.4.9` | `node_modules/tldts-core` |
| `tough-cookie` | `6.0.1` | `6.0.2` | `node_modules/tough-cookie` |
| `type-is` | `2.0.1` | `2.1.0` | `node_modules/type-is` |
| `undici` | `7.24.4` | `7.28.0` | `node_modules/undici` |
| `vite` | `7.3.1` | `7.3.6` | `node_modules/vite` |
| `vitest` | `4.1.2` | `4.1.10` | `node_modules/vitest` |
| `yoctocolors` | `2.1.2` | `2.2.0` | `node_modules/yoctocolors` |

### Lockfile graph additions (4)

These are newly selected graph nodes, not upgrades from an existing version.

| Package | Version | Lockfile location |
| --- | --- | --- |
| `@asamuzakjp/generational-cache` | `1.0.1` | `node_modules/@asamuzakjp/generational-cache` |
| `content-type` | `2.0.0` | `node_modules/body-parser/node_modules/content-type` |
| `undici` | `6.28.0` | `node_modules/node-gyp/node_modules/undici` |
| `content-type` | `2.0.0` | `node_modules/type-is/node_modules/content-type` |

### Lockfile graph removals (5)

| Package | Former version | Former lockfile location |
| --- | --- | --- |
| `lru-cache` | `11.2.7` | `node_modules/@asamuzakjp/css-color/node_modules/lru-cache` |
| `@parcel/watcher-win32-ia32` | `2.5.6` | `node_modules/@parcel/watcher-win32-ia32` |
| `err-code` | `2.0.3` | `node_modules/err-code` |
| `promise-retry` | `2.0.1` | `node_modules/promise-retry` |
| `retry` | `0.12.0` | `node_modules/retry` |

## Patcher defects found during this validation

The hashtag-scraper fixture exposed two bounded registry-query failure cases:

1. An empty npm range lookup such as `request@>2.88.2` returns an npm E404 “No match found” response. It is now treated as an exhausted candidate range rather than a fatal run error.
2. Transient registry failures (`ETIMEDOUT`, `ECONNRESET`, `ENETUNREACH`, and `EAI_AGAIN`) now receive exactly one retry. The existing command timeout still bounds both attempts.

Regression tests cover both behaviors.

## github-spec-kit-demo/frontend

- Source: `/Users/yandre/workspace/github-spec-kit-demo/frontend`
- Test worktree: `/Users/yandre/workspace/github-spec-kit-demo-npm-vuln-patcher-test`
- Source commit: `e72911d2dbed44dd48fdd7feef57b53c35405117`
- Ephemeral snapshot commit: `c1798e693903fdc8618ebb54dd83c7db29e2b377`
- Outcome: Committed partial improvement; unresolved findings remain (exit code 2).
- Duration: **29 seconds**
- Vulnerabilities: 21 → 6 total; critical 2 → 1; high 11 → 1; moderate 7 → 3; low 1 → 1.
- Command: `npm-vuln-patcher --apply --severity high --timeout-ms 30000 --test "./node_modules/.bin/tsc --version && ./node_modules/.bin/vite --version && ./node_modules/.bin/vitest --version" --format json`

The committed application baseline is incomplete:

- Vitest exits because there are no test files.
- The TypeScript build fails on missing UI modules and existing type errors.
- ESLint cannot find a configuration file.

Those failures existed before patching and were reproduced afterward. The transaction therefore used clean install and installed-toolchain execution as its available gate. This provides dependency-resolution confidence but not full application compatibility confidence.

### Direct manifest changes

| Section | Package | Before | After |
| --- | --- | --- | --- |
| devDependencies | `postcss` | `^8.5.10` | `^8.5.18` |
| overrides | `tar` | `7.5.11` | `7.5.22` |
| overrides | `js-yaml` | `4.1.1` | `4.3.0` |
| overrides | `brace-expansion` | none | `5.0.8` |
| overrides | `minimatch` | none | `9.0.9` |
| overrides | `picomatch` | none | `2.3.2` |

### All lockfile package upgrades (8)

| Package | Before | After | Lockfile location |
| --- | --- | --- | --- |
| `balanced-match` | `1.0.2` | `4.0.4` | `node_modules/balanced-match` |
| `brace-expansion` | `2.0.2` | `5.0.8` | `node_modules/brace-expansion` |
| `js-yaml` | `4.1.1` | `4.3.0` | `node_modules/js-yaml` |
| `minimatch` | `9.0.3` | `9.0.9` | `node_modules/minimatch` |
| `nanoid` | `3.3.11` | `3.3.16` | `node_modules/nanoid` |
| `picomatch` | `2.3.1` | `2.3.2` | `node_modules/picomatch` |
| `postcss` | `8.5.14` | `8.5.23` | `node_modules/postcss` |
| `tar` | `7.5.11` | `7.5.22` | `node_modules/tar` |

Nine obsolete nested `brace-expansion`/`minimatch` nodes plus `concat-map@0.0.1` were removed. No graph nodes were added.

### Remaining high/critical findings

- `vitest@1.6.1` requires the major upgrade to `4.1.10`.
- `vite@5.4.20` requires the major upgrade to `6.4.3`.

The enhanced JSON and Markdown reports now identify both as `SEMVER_MAJOR_BLOCKED`, show the attempted versions, and recommend `--allow-major` with a complete verification command.

## themambaleague.com/frontend

- Source: `/Users/yandre/workspace/themambaleague.com/frontend`
- Test worktree: `/Users/yandre/workspace/themambaleague.com-npm-vuln-patcher-test`
- Detached commit: `a9504eb735c05062d9ed94e3439bc3896ec888dd`
- Outcome: Committed one fully validated direct upgrade; unresolved findings remain (exit code 2).
- Duration: **101 seconds** for the final accepted run.
- Vulnerabilities: 18 → 17 total; critical 0 → 0; high 10 → 9; moderate 7 → 7; low 1 → 1.
- Final command: `npm-vuln-patcher --apply --severity high --no-overrides --timeout-ms 60000 --test "npm run lint && npm test && npm run build" --format json`

### Safety diagnostics and rollback

An initial 88-second run used tests and build but omitted lint. It accepted global overrides including `brace-expansion@5.0.8`; the later complete suite showed that this broke ESLint's older nested `minimatch` at runtime.

That result was discarded. A pristine rerun with lint, tests, and build inside the transaction gate rejected the same batch after 69 seconds, returned verification exit code 4, and restored `package.json` and `package-lock.json` byte-for-byte. The final `--no-overrides` run retained only the direct Vite upgrade that passed every gate.

### Independent validation

- Fresh `npm ci`: passed.
- ESLint: passed.
- Vitest: 121 files and 1,040 tests passed.
- React Router client and SSR production builds: passed.
- TypeScript typecheck: passed.
- Final audit: 0 critical, 9 high, 7 moderate, 1 low.

### All package version upgrades (1)

| Section | Package | Before | After |
| --- | --- | --- | --- |
| devDependencies and lockfile | `vite` | `^6.4.2` / `6.4.2` | `^6.4.3` / `6.4.3` |

The refreshed npm lock metadata added six nested WASI support nodes under `@tailwindcss/oxide-wasm32-wasi`; none replaced a previously locked version.

### Remaining high findings

- React Router cohort: `@react-router/dev`, `@react-router/express`, `@react-router/node`, `@react-router/serve`, and `react-router`.
- Override candidates excluded by the safe run: `brace-expansion`, `js-yaml`, `postcss`, and `undici`.

The React Router `7.18.1` cohort was rejected because it introduced new high ESLint findings and expanded vulnerable ranges. React Router `8.3.0` is a major migration. The structured output reports the applicable `AUDIT_REGRESSION`, `SEMVER_MAJOR_BLOCKED`, peer evidence, attempted versions, and safe next actions.

## Additional limitation found during Mamba validation

The final verification gate is correctly atomic, but a behavioral failure currently rolls back the whole staged result. The resolver does not yet retry smaller subsets after a combined batch passes install/audit checks but fails the user-supplied verification command. Global overrides can also be installable while remaining runtime-incompatible with older consumers.

## Worktree cleanup

After recording and validating all results, the detached test worktrees for `hashtag-scraper`, `scaffold-app`, `github-spec-kit-demo`, and `themambaleague.com` were force-removed and pruned. Their uncommitted test-only package changes were intentionally discarded. The original repositories retain exactly their pre-existing statuses, and unrelated Mamba League worktrees were preserved.
