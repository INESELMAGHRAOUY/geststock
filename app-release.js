const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const releaseName='jumia-complete-v4';
function getRelease(root){const hash=crypto.createHash('sha256');for(const dir of ['', 'public'])for(const file of fs.readdirSync(path.join(root,dir)).filter(file=>/\.(js|css)$/.test(file)).sort()){hash.update(dir+'/'+file+'\0');hash.update(fs.readFileSync(path.join(root,dir,file)));}return {name:releaseName,assetsVersion:hash.digest('hex').slice(0,16)};}
function versionHtml(html,release){return html.replace(/((?:src|href)=")\/(?!\/)([^"?#]+\.(?:js|css))(?:\?[^"#]*)?"/g,(_,attribute,file)=>attribute+'/'+file+'?v='+release.assetsVersion+'"').replace('</head>','<meta name="geststock-release" content="'+release.name+'"><meta name="geststock-assets-version" content="'+release.assetsVersion+'"></head>');}
module.exports={getRelease,versionHtml};
