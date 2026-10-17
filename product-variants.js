// A variant keeps its own product ID so every existing stock movement targets it.
function normalizeProductVariant(body,products=[]){
 const existing=products.find(p=>p.id===body.id);
 const result={};
 for(const key of ['color','size']){
  const value=body[key]===undefined?(existing?.[key]||''):body[key];
  if(typeof value!=='string'||value.length>80)throw Error('Couleur ou taille invalide (80 caractères maximum)');
  result[key]=value.trim();
 }
 const submitted=body.name;
 if(typeof submitted!=='string'||!submitted.trim())throw Error('Désignation obligatoire');
 // Older clients may submit the full display name when editing another field.
 result.modelName=(existing?.modelName&&submitted===existing.name?existing.modelName:submitted).trim();
 result.name=[result.modelName,result.color,result.size].filter(Boolean).join(' / ');
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
 if((result.color||result.size)&&products.some(p=>p.id!==body.id&&p.active!==false&&normalize(p.modelName||p.name)===normalize(result.modelName)&&normalize(p.color)===normalize(result.color)&&normalize(p.size)===normalize(result.size)))throw Error('Cette variante couleur / taille existe déjà pour ce modèle');
 return result;
}
module.exports={normalizeProductVariant};
