
const http=require('node:http');
const initial=()=>({mode:'normal',calls:[],containers:{},created:0,published:0});
http.createServer(async(req,res)=>{
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 try{
  const u=new URL(req.url,'http://qa'),p=u.pathname.replace(/^\/instagram/,'');
  let s=await pm.state.get('instagram.state')||initial();
  if(p==='/__qa/state')return json(200,s);
  if(p==='/__qa/reset'){s=initial();await pm.state.set('instagram.state',s);return json(200,s);}
  if(p==='/__qa/mode'){s.mode=req.body.mode;await pm.state.set('instagram.state',s);return json(200,{mode:s.mode});}
  const raw=req.body||{};
  const body=typeof raw==='string'?Object.fromEntries(new URLSearchParams(raw))
    :Buffer.isBuffer(raw)?Object.fromEntries(new URLSearchParams(raw.toString())):raw;
  s.calls.push({method:req.method,path:p,caption:body.caption,image_url:body.image_url,creation_id:body.creation_id,grant_type:body.grant_type||u.searchParams.get('grant_type')});
  const finish=async(status,data)=>{await pm.state.set('instagram.state',s);return json(status,data);};
  if(p==='/graph.facebook.com/v27.0/oauth/access_token'&&req.method==='GET'){
   if(u.searchParams.get('client_id')!=='100000000000001'||u.searchParams.get('client_secret')!=='instagram-qa-secret'||!u.searchParams.get('redirect_uri')?.endsWith('/api/instagram/oauth/callback/')||!u.searchParams.get('code'))return finish(400,{error:{code:100}});
   return finish(200,{access_token:'qa-instagram-suat-token',token_type:'bearer'});
  }
  if(p==='/graph.facebook.com/v27.0/debug_token')return finish(200,{data:{app_id:'100000000000001',type:'SYSTEM_USER',is_valid:true,user_id:'100000000000004',scopes:s.mode==='missing_scope'?['instagram_basic']:s.mode==='excessive'?['instagram_basic','instagram_content_publish','instagram_manage_messages','ads_read']:['instagram_basic','instagram_content_publish','instagram_manage_messages'],expires_at:s.mode==='finite_expiry'?Math.floor(Date.now()/1000)+5184000:0,data_access_expires_at:0}});
  if(req.headers.authorization!=='Bearer qa-instagram-suat-token')return finish(400,{error:{code:190}});
  if(p==='/graph.facebook.com/v27.0/me')return finish(200,{id:'100000000000004',client_business_id:'100000000000003'});
  if(p==='/graph.facebook.com/v27.0/me/assigned_instagram_accounts')return finish(200,{data:[{id:'17840000000000001',username:'openmind_qa'}]});
  if(p==='/graph.facebook.com/v27.0/17840000000000001')return finish(200,{id:'17840000000000001',username:'openmind_qa'});
  if(p==='/graph.facebook.com/v27.0/17840000000000001/media'&&req.method==='POST'){
   if(!/^https:\/\/[a-z0-9.-]+\/api\/instagram\/imagenes\//.test(body.image_url||'')||typeof body.caption!=='string')return finish(400,{error:{code:100}});
   const id=String(18000000000000000n+BigInt(++s.created));s.containers[id]={published:false};
   return finish(s.mode==='container500'?500:200,s.mode==='container500'?{error:{code:2}}:{id});
  }
  if(p==='/graph.facebook.com/v27.0/17840000000000001/media_publish'&&req.method==='POST'){
   const container=s.containers[body.creation_id];if(!container)return finish(400,{error:{code:100}});
   container.published=true;const id=String(19000000000000000n+BigInt(++s.published));
   return finish(s.mode==='publish500'?500:200,s.mode==='publish500'?{error:{code:2}}:{id});
  }
  const id=p.split('/').at(-1);
  if(s.containers[id]&&req.method==='GET')return finish(200,{id,status_code:s.containers[id].published?'PUBLISHED':s.mode==='pending'?'IN_PROGRESS':s.mode==='container_error'?'ERROR':'FINISHED'});
  return finish(501,{error:{code:100,message:'Endpoint outside the modeled Instagram contract'}});
 }catch{return json(500,{error:{code:2}});}
}).listen(process.env.PORT);
