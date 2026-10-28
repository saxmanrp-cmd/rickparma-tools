export const PASSKEY_CLIENT=String.raw`
(() => {
  const button=document.getElementById('passkey-button');
  const message=document.getElementById('passkey-message');
  if(!button||!message)return;
  const setup=document.body.dataset.passkeyPage==='setup';
  const token=new URLSearchParams(location.search).get('token');
  if(setup&&!token){button.disabled=true;message.textContent='This setup link is missing its code. Ask Richard for a new link.';return;}
  if(!window.PublicKeyCredential||!navigator.credentials){button.disabled=true;message.textContent='This browser cannot use passkeys. Open the link in Safari or Chrome on your phone or computer.';return;}
  const decode=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'==='.slice((value.length+3)%4)),character=>character.charCodeAt(0));
  const encode=value=>btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  async function post(path,body){
    const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'Please try again.');
    return data;
  }
  button.addEventListener('click',async()=>{
    button.disabled=true;message.textContent=setup?'Follow your device’s Face ID or passkey prompt.':'Use Face ID or approve the passkey prompt on your device.';
    try{
      if(setup){
        const options=await post('/webauthn/register/options',{token});
        options.challenge=decode(options.challenge);options.user.id=decode(options.user.id);
        options.excludeCredentials=(options.excludeCredentials||[]).map(item=>({...item,id:decode(item.id)}));
        const credential=await navigator.credentials.create({publicKey:options});
        if(!credential)throw Error('No passkey was created. Please try again.');
        const result={id:credential.id,rawId:encode(credential.rawId),type:credential.type,
          response:{attestationObject:encode(credential.response.attestationObject),clientDataJSON:encode(credential.response.clientDataJSON),transports:credential.response.getTransports?.()||[]},
          clientExtensionResults:credential.getClientExtensionResults(),authenticatorAttachment:credential.authenticatorAttachment};
        await post('/webauthn/register/verify',{token,credential:result});
      }else{
        const options=await post('/webauthn/login/options',{});
        options.challenge=decode(options.challenge);
        if(options.allowCredentials)options.allowCredentials=options.allowCredentials.map(item=>({...item,id:decode(item.id)}));
        const credential=await navigator.credentials.get({publicKey:options});
        if(!credential)throw Error('No passkey was selected. Please try again.');
        const result={id:credential.id,rawId:encode(credential.rawId),type:credential.type,
          response:{authenticatorData:encode(credential.response.authenticatorData),clientDataJSON:encode(credential.response.clientDataJSON),signature:encode(credential.response.signature),userHandle:credential.response.userHandle?encode(credential.response.userHandle):undefined},
          clientExtensionResults:credential.getClientExtensionResults(),authenticatorAttachment:credential.authenticatorAttachment};
        await post('/webauthn/login/verify',{credential:result});
      }
      message.textContent='You’re in. Opening Gazelle…';location.assign('/');
    }catch(error){
      message.textContent=error.name==='NotAllowedError'?'The passkey prompt was closed. Tap the button to try again.':error.message||'Please try again.';
      button.disabled=false;
    }
  });
})();
`;
