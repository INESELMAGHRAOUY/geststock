(function(root){
 const units=['zéro','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize'];
 function belowHundred(n,beforeThousand=false){
 if(n<17)return units[n];if(n<20)return 'dix-'+units[n-10];
 if(n<70){const tens=['','','vingt','trente','quarante','cinquante','soixante'][Math.floor(n/10)],rest=n%10;return tens+(rest===0?'':rest===1?' et un':'-'+units[rest]);}
 if(n<80)return 'soixante'+(n===71?' et onze':'-'+belowHundred(n-60));
 if(n===80)return 'quatre-vingt'+(beforeThousand?'':'s');
 return 'quatre-vingt-'+belowHundred(n-80);
 }
 function belowThousand(n,beforeThousand=false){
 if(n<100)return belowHundred(n,beforeThousand);
 const hundreds=Math.floor(n/100),rest=n%100;
 const prefix=(hundreds===1?'':units[hundreds]+' ')+'cent'+(hundreds>1&&rest===0&&!beforeThousand?'s':'');
 return prefix+(rest?' '+belowHundred(rest,beforeThousand):'');
 }
 function integerWords(n){
 if(n===0)return units[0];const parts=[];
 for(const [scale,singular] of [[1e12,'billion'],[1e9,'milliard'],[1e6,'million'],[1000,'mille']]){
 const count=Math.floor(n/scale);if(count){parts.push(scale===1000?(count===1?'mille':belowThousand(count,true)+' mille'):belowThousand(count)+' '+singular+(count>1?'s':''));n%=scale;}
 }
 if(n)parts.push(belowThousand(n));return parts.join(' ');
 }
 function amountToWords(amount,currency='MAD'){
 const cents=Math.round(Number(amount)*100);
 if(!Number.isFinite(Number(amount))||Number(amount)<0||!Number.isSafeInteger(cents))throw Error('Montant invalide pour la conversion en lettres');
 const whole=Math.floor(cents/100),fraction=cents%100;
 const names={MAD:['dirham','dirhams','centime','centimes'],EUR:['euro','euros','centime','centimes'],USD:['dollar','dollars','cent','cents']};
 const unit=names[String(currency).toUpperCase()]||[String(currency),String(currency),'centime','centimes'];
 // Exact multiples of a million take “de” before the currency noun.
 return integerWords(whole)+(whole>=1e6&&whole%1e6===0?' de ':' ')+unit[whole>1?1:0]+(fraction?' et '+integerWords(fraction)+' '+unit[fraction>1?3:2]:'');
 }
 root.amountToWords=amountToWords;
 if(typeof module!=='undefined'&&module.exports)module.exports={amountToWords};
})(globalThis);
