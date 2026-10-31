"""Package only the server source; no credentials, tests, desktop or CRM files."""
import argparse, hashlib, json, zipfile
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('output', type=Path)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]/'cloud'
files=[p for p in root.glob('*.js') if not p.name.endswith('.test.js') and p.name!='test.js']
files += list((root/'console').glob('*.js')) + list((root/'console').glob('*.html'))
files += [root/n for n in ['package.json','package-lock.json','apphosting.yaml']]
# The Firebase example is redundant and may confuse manual configuration.
files=[p for p in files if not p.name.endswith('.example.js')]
required={'service.js','build-apphosting.js','package.json','package-lock.json','apphosting.yaml','console/index.html','console/app.js','console/firebase-config.js'}
names={str(p.relative_to(root)) for p in files}
if not required <= names: raise SystemExit('Missing deployment assets')
package=json.loads((root/'package.json').read_text())
lock=json.loads((root/'package-lock.json').read_text())
if package['dependencies'] != lock['packages']['']['dependencies']: raise SystemExit('Dependency lock mismatch')
args.output.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(args.output,'w',zipfile.ZIP_DEFLATED) as archive:
 for file in sorted(files): archive.write(file,file.relative_to(root))
print(json.dumps({'file':str(args.output.resolve()),'files':len(files),'sha256':hashlib.sha256(args.output.read_bytes()).hexdigest()}))
