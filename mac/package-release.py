from pathlib import Path
import argparse,hashlib,shutil,tempfile,zipfile
p=argparse.ArgumentParser(description='Package the extension and bundled server without a Node runtime.')
p.add_argument('--platform',required=True,choices=['mac','win']);p.add_argument('--server-bundle',required=True,type=Path);p.add_argument('--output',required=True,type=Path)
a=p.parse_args();src=Path(__file__).resolve().parent;version=(src/'VERSION').read_text().strip();name=f'stop-the-slop-for-brower-{version}-{a.platform}'
a.output.mkdir(parents=True,exist_ok=True);archive=a.output/(name+'.zip');assert not archive.exists()
with tempfile.TemporaryDirectory(prefix='slop-light-package-') as temp:
 target=Path(temp)/name;target.mkdir();(target/'local-server').mkdir()
 shutil.copytree(src/'extension',target/'extension',ignore=shutil.ignore_patterns('.DS_Store','*.log'))
 shutil.copytree(src/'native',target/'native',ignore=shutil.ignore_patterns('controller-config.json','*.log'))
 installer='安装本机组件.command' if a.platform=='mac' else '安装本机组件.bat'
 shutil.copy2(src/installer,target/installer)
 shutil.copy2(a.server_bundle,target/'local-server/server.mjs');shutil.copy2(src/'local-server/settings-ui.js',target/'local-server/settings-ui.js')
 start='启动检测.command' if a.platform=='mac' else '启动检测-Windows.bat'
 for f in [start,'PRIVACY.md','UPSTREAM.md','VERSION','使用说明.md','JOSE-LICENSE.md']:shutil.copy2(src/f,target/f)
 shutil.copy2(src/'使用说明.md',target/'先看安装说明.txt')
 (target/'SHA256SUMS.txt').write_text('\n'.join(f'{hashlib.sha256(f.read_bytes()).hexdigest()}  {f.relative_to(target).as_posix()}' for f in sorted(target.rglob('*')) if f.is_file())+'\n')
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
  for f in sorted(target.rglob('*')):
   if f.is_file():z.write(f,f.relative_to(target.parent))
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 for n in z.namelist():
  assert not any(x in Path(n).parts for x in ['runtime','node_modules','.local-data','.env','accounts.json','providers.json','connection.json'])
  assert not n.endswith(('.exe','.dll','.ps1','.log'))
print(archive.name,archive.stat().st_size,'bytes')
