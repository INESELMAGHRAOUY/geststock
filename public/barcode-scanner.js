(function(){
 let decoderPromise,session=0,controls=null,dialog=null,nativeTimer=null;
 function loadDecoder(){if(window.ZXingBrowser)return Promise.resolve(window.ZXingBrowser);if(!decoderPromise)decoderPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/zxing-browser.min.js';script.onload=()=>window.ZXingBrowser?resolve(window.ZXingBrowser):reject(Error('Scanner indisponible'));script.onerror=()=>{script.remove();decoderPromise=null;reject(Error('Impossible de charger le scanner. Réessayez.'));};document.head.append(script);});return decoderPromise;}
 function stopCamera(){session++;clearTimeout(nativeTimer);nativeTimer=null;if(controls){controls.stop();controls=null;}if(dialog){const video=dialog.querySelector('video');for(const track of video?.srcObject?.getTracks()||[])track.stop();if(video)video.srcObject=null;}}
 function close(){stopCamera();if(dialog?.open)dialog.close();}
 async function scan(button){const form=button.form,input=form?.elements.barcode;if(!input)return;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){showMessage(form,'La caméra nécessite HTTPS et un navigateur récent. Vous pouvez saisir le code-barres manuellement.');return;}
  if(!dialog){dialog=document.createElement('dialog');dialog.id='barcode-scanner-dialog';dialog.setAttribute('aria-labelledby','barcode-scanner-title');dialog.innerHTML='<div class="toolbar"><h2 id="barcode-scanner-title">Scanner le code-barres</h2><button type="button" data-stop-barcode class="secondary">Fermer</button></div><video autoplay playsinline muted></video><p role="status">Ouverture de la caméra…</p><p>Placez le code-barres face à la caméra arrière, avec assez de lumière. Le formulaire sera rempli dès sa lecture.</p>';document.body.append(dialog);dialog.querySelector('[data-stop-barcode]').addEventListener('click',close);dialog.addEventListener('cancel',close);dialog.addEventListener('close',stopCamera);}
  stopCamera();const revision=session;const status=dialog.querySelector('[role="status"]');status.textContent='Ouverture de la caméra…';if(!dialog.open)dialog.showModal();
  try{const library=await loadDecoder();if(revision!==session||!dialog.open)return;const hints=new Map([[3,true],[2,[7,6,14,4,2,3]]]); // ZXing DecodeHintType.TRY_HARDER
   const reader=new library.BrowserMultiFormatReader(hints,{delayBetweenScanAttempts:150,delayBetweenScanSuccess:300});
   let candidate='',matches=0;
   const accept=(code,format)=>{if(revision!==session||!dialog.open||!code||code.length>150)return false;
    if(/^\d+$/.test(code)){const expected=({7:13,6:8,14:12,ean_13:13,ean_8:8,upc_a:12})[format];if(!expected||code.length!==expected||!validGtin(code)){candidate='';matches=0;status.textContent='Lecture incomplète — gardez le code entier et ses marges blanches dans le cadre.';return false;}}
    if(candidate===code)matches++;else{candidate=code;matches=1;}if(matches<3){status.textContent='Vérification du code… gardez le téléphone stable.';return false;}if(form.isConnected){input.value=code;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));showMessage(form,'Code-barres lu : '+code);input.focus();}close();return true;};const acquired=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}},dialog.querySelector('video'),(result,error,scanner)=>{if(revision!==session||!dialog.open){scanner?.stop();return;}if(result)accept(result.getText(),result.getBarcodeFormat());});if(revision!==session||!dialog.open)acquired.stop();else{controls=acquired;status.textContent='Visez le code à 15–25 cm, gardez toutes les barres et les marges blanches visibles. Attendez la mise au point.';
    const video=dialog.querySelector('video'),track=video.srcObject?.getVideoTracks?.()[0];
    try{const caps=track?.getCapabilities?.();if(caps?.focusMode?.includes('continuous'))await track.applyConstraints({advanced:[{focusMode:'continuous'}]});}catch{} // Focus is optional on some phones.
    if(revision!==session||!dialog.open)return;
    startNativeDetection(video,accept,revision);}}
  catch(error){if(revision!==session||!dialog.open)return;stopCamera();status.textContent=error.name==='NotAllowedError'?'Accès caméra refusé. Autorisez la caméra dans votre navigateur, puis réessayez.':error.name==='NotFoundError'?'Aucune caméra trouvée. Saisissez le code manuellement.':error.name==='NotReadableError'?'Caméra occupée. Fermez les autres applications caméra et réessayez.':error.message||'Lecture impossible. Saisissez le code manuellement.';}
 }
 async function startNativeDetection(video,accept,revision){
  if(!window.BarcodeDetector)return;
  try{const formats=await window.BarcodeDetector.getSupportedFormats(),wanted=['ean_13','ean_8','upc_a','code_128','code_39','code_93'].filter(f=>formats.includes(f));if(!wanted.length)return;const detector=new window.BarcodeDetector({formats:wanted});
   const tick=async()=>{if(revision!==session||!dialog.open)return;try{if(video.readyState>=2){const results=await detector.detect(video);if(revision!==session||!dialog.open)return;const found=results.find(r=>r.rawValue);if(found&&accept(found.rawValue,found.format))return;}}catch{}if(revision===session&&dialog.open)nativeTimer=setTimeout(tick,180);};tick();
  }catch{} // ZXing remains active when native detection is unavailable.
 }
 function validGtin(code){let sum=0;for(let i=code.length-2,weight=3;i>=0;i--,weight=weight===3?1:3)sum+=Number(code[i])*weight;return (10-sum%10)%10===Number(code.at(-1));}
 function showMessage(form,message){let note=form.querySelector('[data-barcode-message]');if(!note){note=document.createElement('small');note.dataset.barcodeMessage='';note.setAttribute('role','status');form.elements.barcode.closest('label').append(note);}note.textContent=message;}
 document.addEventListener('click',event=>{const button=event.target.closest('[data-scan-product-barcode]');if(button)scan(button);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)close();});window.addEventListener('pagehide',close);
})();
