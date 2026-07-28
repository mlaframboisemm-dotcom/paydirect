(async()=>{
  const base='http://localhost:3001';
  const email='copilot-test-'+Date.now()+"@example.com";
  const password='DevTest123456!';
  try{
    let r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,firstName:'Dev',lastName:'Tester'})});
    console.log('register status',r.status);
    let text=await r.text();
    console.log('register body',text);

    r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
    console.log('login status',r.status);
    text=await r.text();
    console.log('login body',text);
    let j=null;
    try{ j=JSON.parse(text);}catch(e){}
    const token=(j && j.token) ? j.token : null;
    if(!token){ console.error('no token returned; aborting'); process.exit(1); }

    r=await fetch(base+'/api/wise/balances',{headers:{Authorization:'Bearer '+token}});
    console.log('/api/wise/balances status',r.status);
    console.log(await r.text());

    r=await fetch(base+'/api/wise/reconcile',{method:'POST',headers:{Authorization:'Bearer '+token}});
    console.log('/api/wise/reconcile status',r.status);
    console.log(await r.text());
    process.exit(0);
  }catch(e){ console.error('ERROR',e); process.exit(2); }
})();
