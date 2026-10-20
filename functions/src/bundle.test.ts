import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { builtinModules } from 'module';
import path from 'path';

// Deploys install only functions/package.json dependencies; everything else must be inlined by esbuild.
// Fails if the bundle requires a package that isn't declared (e.g. a dependency of @weloot/shared).
describe('functions bundle', () => {
  it('only requires declared dependencies and Node built-ins', () => {
    const root = path.join(__dirname, '..');
    execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore', shell: true });
    const bundle = readFileSync(path.join(root, 'lib', 'index.js'), 'utf8');
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const required = [...bundle.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1] ?? '');
    const packages = new Set(
      required.map((r) =>
        r.startsWith('@') ? r.split('/').slice(0, 2).join('/') : r.split('/')[0],
      ),
    );
    const builtins = new Set(builtinModules);
    const undeclared = [...packages].filter(
      (p) => p && !builtins.has(p.replace(/^node:/, '')) && !(p in pkg.dependencies),
    );
    expect(undeclared).toEqual([]);
  });
});
