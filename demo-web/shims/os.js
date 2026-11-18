// Node's os, as much as the program asks for. The demo presents itself as
// Windows, which is what the great majority of restaurants run.
const os = { platform: () => 'win32', homedir: () => '/afus/home', tmpdir: () => '/afus/temp', hostname: () => 'demo', type: () => 'Windows_NT', release: () => '10', arch: () => 'x64', cpus: () => [{}], totalmem: () => 8e9, freemem: () => 4e9, EOL: '\n', userInfo: () => ({ username: 'demo' }) };
export default os;
export const { platform, homedir, tmpdir, hostname, type, release, arch, cpus, totalmem, freemem, EOL, userInfo } = os;
