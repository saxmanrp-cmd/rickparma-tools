function json(payload,status=200){
  return new Response(JSON.stringify(payload),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
  });
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);

    if(url.pathname==='/api/health'){
      return json({
        ok:true,
        service:'rick-lyrics-finder',
        mode:'web-search'
      });
    }

    return env.ASSETS.fetch(request);
  }
};
