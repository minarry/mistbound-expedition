// Local Mixar authoring entry point; the shipped Web game loads the exported GLBs.
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {positionals,values} = parseArgs({allowPositionals:true,options:{asset:{type:'string'},out:{type:'string'},source:{type:'string'}}});
const [mode] = positionals;
if (positionals.length!==1 || !['build','export'].includes(mode)) throw Error('用法：mixar.mjs build | export --asset house [--source 工程文件] [--out 输出目录]');
if (mode==='build' && (values.asset || values.source)) throw Error('单件导出请使用 export');
const script = resolve(root,'tools/art/build_field_kit.py');
const destination = resolve(root,values.out || 'public/atelier');
const source = resolve(root,values.source || 'public/atelier/source/field-kit.mixar');
const candidates = [resolve(root,'.local/authoring/Mixar.app/Contents/MacOS/Mixar'),'/Applications/Mixar.app/Contents/MacOS/Mixar'];
const executable = process.env.MIXAR_BIN || candidates.find(existsSync) || (process.platform==='darwin'?'Mixar':'mixar');
const args = ['--background'];
if (mode==='export') {
  if (!existsSync(source)) throw Error('找不到源工程：'+source);
  if (!values.asset) throw Error('请选择 --asset，例如 house');
  args.push(source);
}
args.push('--python-exit-code','1','--python',script,'--','--out',destination);
if (mode==='export') args.push('--export-existing','--asset',values.asset);
mkdirSync(destination,{recursive:true});
const resources = resolve(root,'.local/authoring/profile');
mkdirSync(resources,{recursive:true});
const env = {MIXAR_USER_RESOURCES:resources,BLENDER_USER_RESOURCES:resources,...process.env};
const proc = spawnSync(executable,args,{cwd:root,stdio:'inherit',env});
if (proc.error) throw Error('未能运行 Mixar，请用 MIXAR_BIN 指定官方程序。'+proc.error.message);
process.exitCode=proc.status??1;
