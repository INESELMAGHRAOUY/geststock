(function(root){
 function jumiaPricingFees(settings={}){const value=(key,fallback)=>{const n=settings[key];return typeof n==='number'&&Number.isFinite(n)&&n>=0?n:fallback;};return {transport:value('jumiaTransportFee',20),packaging:value('jumiaPackagingFee',5)};}
 if(typeof module!=='undefined'&&module.exports)module.exports={jumiaPricingFees};else root.jumiaPricingFees=jumiaPricingFees;
})(globalThis);
