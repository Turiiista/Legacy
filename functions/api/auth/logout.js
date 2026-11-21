import { cookie, json, isSameOrigin } from '../../_lib/auth.js';
export async function onRequestPost({request}){
  if(!isSameOrigin(request))return json({error:'Origem inválida.'},403);
  const response=json({ok:true});response.headers.append('Set-Cookie',cookie('legacy_session','',{maxAge:0,secure:new URL(request.url).protocol==='https:'}));return response;
}
