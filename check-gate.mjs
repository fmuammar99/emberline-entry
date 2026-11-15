// Local mirror of the competition's six gate rows (from competition.yaml and
// RULES.txt; the sealed scorer itself is not in the kit, so this re-implements
// its documented checks). Run against an /output dir produced by main.ts:
//   node check-gate.mjs /tmp/out1
// Exit code 0 only if every deciding row passes (js_parses is informational).
import { readdirSync, readFileSync, statSync, lstatSync, existsSync } from 'node:fs';
import { join, resolve, relative, extname, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const out = resolve(process.argv[2] || '/tmp/out1');
const workdir = '/home/hatch/workspace/makefun/threejs-fps';
const kit = '/home/hatch/workspace/makefun/threejs-fps-02-kit/threejs-fps-02-kit';
const game = join(out, 'game');
const shots = join(out, 'screenshots');
const dossierPath = join(out, 'dossier.json');
const rows = [];
const row = (name, ok, detail) => {
  rows.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};

function walk(dir, list = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = lstatSync(p);
    list.push({ path: p, isDir: st.isDirectory(), isSymlink: st.isSymbolicLink(), size: st.size });
    if (st.isDirectory() && !st.isSymbolicLink()) walk(p, list);
  }
  return list;
}

// --- 1. game_files: plain files, <=993 files+dirs, <=48 MiB, paths <=1000 bytes.
{
  const entries = walk(game);
  const files = entries.filter((e) => !e.isDir);
  const total = files.reduce((s, e) => s + e.size, 0);
  const symlinks = entries.filter((e) => e.isSymlink);
  const longPaths = entries.filter((e) => Buffer.byteLength(relative(game, e.path), 'utf8') > 1000);
  const ok = entries.length <= 993 && total <= 48 * 1024 * 1024 && symlinks.length === 0 && longPaths.length === 0;
  row('game_files', ok, `${entries.length} entries (<=993), ${files.length} files, ${(total / 1024).toFixed(1)} KiB (<=48 MiB), ${symlinks.length} symlinks, ${longPaths.length} over-long paths`);
}

// --- 2. three_js: kit's 0.187.0 files byte-for-byte, one import map for "three".
{
  const kitThree = join(kit, 'starter/game/vendor/three');
  const myThree = join(game, 'vendor/three');
  let same = true;
  const details = [];
  for (const f of ['three.module.min.js', 'three.core.min.js', 'LICENSE']) {
    const a = readFileSync(join(kitThree, f));
    const b = existsSync(join(myThree, f)) ? readFileSync(join(myThree, f)) : null;
    const eq = b !== null && a.equals(b);
    same = same && eq;
    details.push(`${f} ${eq ? 'identical' : 'MISMATCH'}`);
  }
  const html = readFileSync(join(game, 'index.html'), 'utf8');
  const maps = (html.match(/<script type="importmap">/g) || []).length;
  const mapOk = maps === 1 && html.includes('"three": "./vendor/three/three.module.min.js"');
  const revOk = readFileSync(join(myThree, 'three.core.min.js'), 'utf8').includes("REVISION = '187'");
  row('three_js', same && mapOk && revOk, `${details.join(', ')}; import maps: ${maps} (must be 1, maps three -> ./vendor/three/three.module.min.js); REVISION 187: ${revOk}`);
}

// --- 3. references: every page/module reference relative or mapped, resolving inside game/.
{
  const problems = [];
  const exts = new Set(['.html', '.js', '.mjs', '.ts', '.css', '.json']);
  const files = walk(game).filter((e) => !e.isDir && exts.has(extname(e.path)));
  const refRe = /(?:from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\)|import\s+['"]([^'"]+)['"]|(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*['"]?([^)'"]+)['"]?\s*\)|fetch\(\s*['"]([^'"]+)['"]\))/g;
  for (const f of files) {
    const text = readFileSync(f.path, 'utf8');
    let m;
    while ((m = refRe.exec(text)) !== null) {
      const ref = m.slice(1).find((x) => x !== undefined);
      if (!ref || ref.startsWith('#') || ref.startsWith('data:')) continue;
      if (/^(https?:)?\/\//i.test(ref) || /^[a-z][a-z0-9+.-]*:/i.test(ref) && !ref.startsWith('./') && !ref.startsWith('../')) {
        problems.push(`${relative(game, f.path)}: external ${ref}`);
        continue;
      }
      if (ref.startsWith('/')) { problems.push(`${relative(game, f.path)}: absolute ${ref}`); continue; }
      if (ref === 'three' || ref.startsWith('three/')) continue; // import-mapped
      const target = resolve(dirname(f.path), ref.split(/[?#]/)[0]);
      if (!target.startsWith(game + '/') && target !== game) {
        problems.push(`${relative(game, f.path)}: escapes game/ (${ref})`);
      } else if (!existsSync(target)) {
        problems.push(`${relative(game, f.path)}: missing ${ref}`);
      }
    }
  }
  row('references', problems.length === 0, problems.length ? problems.slice(0, 10).join(' | ') : `${files.length} text files scanned, all references resolve inside game/`);
}

// --- 4. screenshots: 3-4 files, <=256 KiB each, long side <=1280, short side >=480.
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off < buf.length - 9) {
    if (buf[off] !== 0xff) { off += 1; continue; }
    const marker = buf[off + 1];
    const len = buf.readUInt16BE(off + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
    }
    off += 2 + len;
  }
  return null;
}
{
  const names = existsSync(shots) ? readdirSync(shots).sort() : [];
  const details = [];
  let ok = names.length >= 3 && names.length <= 4;
  for (const n of names) {
    const buf = readFileSync(join(shots, n));
    const size = buf.length;
    const dim = jpegSize(buf);
    const dimOk = dim && Math.max(dim.w, dim.h) <= 1280 && Math.min(dim.w, dim.h) >= 480;
    ok = ok && size <= 262144 && dimOk;
    details.push(`${n} ${(size / 1024).toFixed(1)} KiB${dim ? ` ${dim.w}x${dim.h}` : ' (not a JPEG)'}`);
  }
  row('screenshots', ok, `${names.length} files (need 3-4): ${details.join('; ')}`);
}

// --- 5. dossier_matches: dossier.json is exactly what buildDossier writes, <=1.5 MiB.
{
  const size = existsSync(dossierPath) ? statSync(dossierPath).size : -1;
  let rebuilt = null;
  try {
    // Rebuild with the vendored library from the same /output dir.
    const { buildDossier } = await import(join(workdir, 'vendor/makefun-threejs.ts').replace(/\.ts$/, '.ts'));
    rebuilt = buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 });
  } catch (e) {
    rebuilt = `ERROR: ${e.message}`;
  }
  const actualBuf = existsSync(dossierPath) ? readFileSync(dossierPath) : Buffer.alloc(0);
  const rebuiltBuf = (typeof rebuilt === 'string') ? Buffer.from(rebuilt, 'utf8')
    : (rebuilt && typeof rebuilt === 'object' && typeof rebuilt.length === 'number') ? Buffer.from(rebuilt)
    : null;
  const match = rebuiltBuf !== null && rebuiltBuf.equals(actualBuf);
  row('dossier_matches', match && size <= 1572864, `${(size / 1024).toFixed(1)} KiB (<=1.5 MiB), rebuild byte-identical: ${match}${rebuiltBuf && !match ? ` (rebuilt ${rebuiltBuf.length} bytes vs actual ${actualBuf.length})` : ''}`);
}

// --- 6. js_parses (informational, never decides validity).
{
  const jsFiles = walk(game).filter((e) => !e.isDir && (extname(e.path) === '.js' || extname(e.path) === '.mjs'));
  const bad = [];
  const node = '/home/hatch/workspace/makefun/node22/node-v22.23.5-linux-x64/bin/node';
  for (const f of jsFiles) {
    try {
      execFileSync(node, ['--input-type=module', '--check'], { input: readFileSync(f.path), stdio: ['pipe', 'ignore', 'pipe'] });
    } catch {
      bad.push(relative(game, f.path));
    }
  }
  row('js_parses (informational)', bad.length === 0, `${jsFiles.length - bad.length}/${jsFiles.length} JS files parse${bad.length ? `; fail: ${bad.join(', ')}` : ''}`);
}

const deciding = rows.filter((r) => !r.name.startsWith('js_parses'));
const failed = deciding.filter((r) => !r.ok);
console.log(`\n${deciding.length - failed.length}/${deciding.length} deciding rows pass${failed.length ? `; FAILING: ${failed.map((r) => r.name).join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
