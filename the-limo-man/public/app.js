const form=document.querySelector('#signup-form');
const status=document.querySelector('#signup-status');
if(new URLSearchParams(location.search).get('joined')==='1')status.textContent="You’re on the list. Thanks for joining the ride!";
form.addEventListener('submit',async event=>{
  event.preventDefault();const email=form.querySelector('[name=email]');email.value=email.value.trim();
  if(!form.reportValidity()||form.querySelector('[name=botcheck]').checked)return;
  const button=form.querySelector('button');if(button.disabled)return;
  button.disabled=true;button.textContent='Saving…';status.textContent='';form.setAttribute('aria-busy','true');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form))),signal:controller.signal});
    const result=await response.json();if(!response.ok||result.success!==true)throw new Error(result.message||'Your signup could not be saved. Please try again.');
    form.reset();status.textContent='You’re on the list. Thanks for joining the ride!';
  }catch(error){status.textContent=error.name==='AbortError'?'This is taking longer than expected. Please try again.':error.message||'Could not save your signup. Please try again.';}
  finally{clearTimeout(timer);button.disabled=false;button.textContent='Keep me posted';form.removeAttribute('aria-busy');}
});
