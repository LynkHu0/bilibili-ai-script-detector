"""Build a macOS ZIP from a bundled server and SHA256-verified official Node archive."""
from pathlib import Path
import argparse, hashlib, json, shutil, tarfile, tempfile, zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--arch', choices=['arm64', 'x64'], required=True)
parser.add_argument('--node-archive', type=Path, required=True)
parser.add_argument('--node-checksums', type=Path, required=True)
parser.add_argument('--server-bundle', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
source = Path(__file__).resolve().parent
version = (source / 'VERSION').read_text().strip()
expected = dict(line.split(maxsplit=1)[::-1] for line in args.node_checksums.read_text().splitlines() if line.strip())
actual = hashlib.sha256(args.node_archive.read_bytes()).hexdigest()
assert expected.get(args.node_archive.name) == actual, 'Official Node SHA256 mismatch'
assert args.node_archive.name.endswith(f'-darwin-{args.arch}.tar.gz'), 'Node archive architecture mismatch'
node_prefix = args.node_archive.name.removesuffix('.tar.gz')
name = f'stop-the-slop-for-brower-{version}-mac-{args.arch}'
args.output.mkdir(parents=True, exist_ok=True)
archive = args.output / (name + '.zip')
assert not archive.exists(), 'Do not overwrite an existing archive'
with tempfile.TemporaryDirectory(prefix='slop-mac-package-') as tmp:
    target = Path(tmp) / name
    (target / 'runtime').mkdir(parents=True)
    (target / 'local-server').mkdir()
    shutil.copytree(source / 'extension', target / 'extension', ignore=shutil.ignore_patterns('.DS_Store', '*.log'))
    shutil.copy2(args.server_bundle, target / 'local-server/server.mjs')
    shutil.copy2(source / 'local-server/settings-ui.js', target / 'local-server/settings-ui.js')
    for filename in ['启动检测.command', 'UPSTREAM.md', 'PRIVACY.md', 'VERSION']:
        shutil.copy2(source / filename, target / filename)
    with tarfile.open(args.node_archive, 'r:gz') as tar:
        for member, filename in [('bin/node', 'node'), ('LICENSE', 'NODE-LICENSE.txt'), ('README.md', 'NODE-README.md')]:
            stream = tar.extractfile(f'{node_prefix}/{member}')
            assert stream is not None
            (target / 'runtime' / filename).write_bytes(stream.read())
    (target / 'runtime/node').chmod(0o755)
    (target / 'runtime/ARCH').write_text(args.arch + '\n')
    # The server bundle embeds jose; retain its full upstream license.
    license_path = source / 'JOSE-LICENSE.md'
    shutil.copy2(license_path, target / 'JOSE-LICENSE.md')
    (target / 'BUILD-INFO.json').write_text(json.dumps({
        'version': version, 'platform': 'macOS', 'arch': args.arch,
        'node_archive': args.node_archive.name, 'node_archive_sha256': actual,
        'node_source': f'https://nodejs.org/dist/{node_prefix.split("-darwin-")[0].removeprefix("node-")}/',
        'server_bundle_sha256': hashlib.sha256(args.server_bundle.read_bytes()).hexdigest(),
    }, indent=2) + '\n')
    chip = 'Apple 芯片（M 系列）' if args.arch == 'arm64' else 'Intel 处理器'
    (target / '先看安装说明.txt').write_text(f'''macOS {args.arch} 版 {version}，适用于{chip}。
本包内置官方 Node.js 及服务依赖，无需安装 Node.js 或 npm。
1. 完整解压后双击“启动检测.command”，保持启动窗口运行。
2. Chrome / Edge 扩展管理页开启开发人员模式，加载本包 extension 文件夹。
3. 打开 http://127.0.0.1:17653/，配置自己的 ChatGPT 登录或 DeepSeek Key。
4. 插件自动连接本机服务，无需复制连接码；配置服务后登录 B站并刷新页面。
本机资料：~/Library/Application Support/StopTheSlop（不可分享）。
关闭启动窗口可停止服务。新旧版本不要同时运行，以免占用同一端口。
如系统阻止启动，先核验下载来源，再按 macOS 的系统提示处理。
''', encoding='utf-8-sig')
    paths = sorted(p for p in target.rglob('*') if p.is_file())
    (target / 'SHA256SUMS.txt').write_text('\n'.join(
        f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(target).as_posix()}' for p in paths) + '\n')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in sorted(target.rglob('*')):
            if p.is_file(): z.write(p, p.relative_to(target.parent))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None, 'ZIP integrity error'
    for name in z.namelist():
        assert not any(x in Path(name).parts for x in ['node_modules', '.local-data', '.npm-cache'])
        assert Path(name).name not in ['accounts.json', 'providers.json', 'connection.json', '.env']
        assert not name.endswith(('.exe', '.bat', '.cmd', '.ps1', '.log'))
print(archive)
