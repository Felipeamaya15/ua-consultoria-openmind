const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {load}=require('./source-loader.cjs');
const root=path.resolve(__dirname,'../src');
const jsx=(type,props)=>({type,props});
const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):tree&&typeof tree==='object'?[tree,...nodes(tree.props?.children)]:tree==null?[]:[tree];
const label=node=>nodes(node).filter(value=>typeof value==='string').join('');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function harness(file,name,initial,mocks={}){
  let cursor=0,answer=null,resolve,options;
  const state=[...initial],notices=[];
  const feedback={confirm:value=>{options=value;return new Promise(done=>resolve=done);},ask:value=>{options=value;return new Promise(done=>resolve=done);},notify:(...args)=>notices.push(args)};
  const react={useState:value=>{const index=cursor++;if(!(index in state))state[index]=value;return[state[index],value=>state[index]=typeof value==='function'?value(state[index]):value];},useEffect(){},useRef:value=>({current:value}),useMemo:fn=>fn(),useCallback:fn=>fn};
  const ui=Object.fromEntries(['Alert','Button','EmptyState','Modal','Input','Select','Toggle','Badge','AdminCard'].map(name=>[name,name]));
  const component=load(file,{
    react,'react/jsx-runtime':{jsx,jsxs:jsx},
    '../../../shared/components/FeedbackProvider':{useFeedback:()=>feedback},
    '../../../../shared/components/FeedbackProvider':{useFeedback:()=>feedback},
    '../../../shared/components/states':{LoadingState:'LoadingState',EmptyListState:'EmptyListState'},
    './ui':ui,'../components/ui':ui,
    '../data/mockAdminData':{formatPrice:String},
    ...mocks,
  })[name];
  return {render:props=>{cursor=0;return nodes(component(props));},button(tree,name){const result=tree.find(node=>['Button','button'].includes(node.type)&&label(node)===name);assert(result,'Botón '+name);return result;},get options(){return options;},respond(value){answer=value;resolve(answer);},notices};
}

test('el frontend no llama a alert, confirm ni prompt nativos',()=>{
  const found=[];
  function inspect(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){inspect(file);continue;}
    if(!/\.[jt]sx?$/.test(file))continue;
    const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
    function visit(node){
      if(ts.isCallExpression(node)){
        const target=node.expression;
        const direct=ts.isIdentifier(target)&&['alert','confirm','prompt'].includes(target.text);
        const host=ts.isPropertyAccessExpression(target)||ts.isElementAccessExpression(target)?target.expression:null;
        const method=ts.isPropertyAccessExpression(target)?target.name.text:ts.isElementAccessExpression(target)&&ts.isStringLiteral(target.argumentExpression)?target.argumentExpression.text:'';
        if(direct||host&&['window','globalThis','self'].includes(host.getText(source))&&['alert','confirm','prompt'].includes(method))found.push(path.relative(root,file)+':'+(source.getLineAndCharacterOfPosition(node.getStart()).line+1));
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
  }}
  inspect(root);assert.deepEqual(found,[]);
});

for(const action of ['approve','reject'])test('transferencia '+action+': espera confirmación, cancelar no escribe y aceptar conserva el endpoint',async()=>{
  const calls=[],transfer={id_pedido:42,identificador:'QA-42',medio_pago:'Transferencia',fecha_creacion:'2037-01-01',monto_total:5000};
  const h=harness('src/features/admin/components/PendingTransfers.tsx','PendingTransfers',[[transfer],false,'',0,null,null,''],{
    '../services/pendingTransfersService':{approveManualTransfer:async id=>{calls.push(['approve',id]);return{mensaje:'Abono registrado QA'};},rejectManualTransfer:async id=>{calls.push(['reject',id]);return{mensaje:'Rechazado QA'};}},
  });
  const tree=h.render(),button=tree.find(node=>node.type==='Button'&&label(node).includes(action==='approve'?'Aprobar':'Rechazar'));
  assert(button);
  let operation=button.props.onClick();await tick();assert.equal(calls.length,0);
  assert.equal(h.options.confirmLabel,action==='approve'?'Confirmar abono':'Rechazar transferencia');
  h.respond(false);await operation;assert.equal(calls.length,0);
  operation=button.props.onClick();await tick();assert.equal(calls.length,0);
  h.respond(true);await operation;assert.deepEqual(calls,[[action,42]]);
});

test('anulación de un taller: cancelar conserva la inscripción y confirmar envía el motivo al mismo pedido',async()=>{
  const calls=[],row={id:'activity-qa',pedido:'QA-42',titulo:'Taller QA',cantidad:1,importe:5000,devolucion:{},puede_solicitar:true};
  const h=harness('src/features/storefront/components/store/PaidActivityOrderQA.tsx','PaidActivityOrderQA',[{items:[row],correo_tienda:''},0,'',''],{
    '../../../landing/services/activitySalesQA':{saleMoney:String,saleDate:String,saleState:()=>'',salesQA:async(...args)=>calls.push(args)},
  });
  const tree=h.render({orderId:42}),button=h.button(tree,'Solicitar anulación');
  button.props.onClick();assert.equal(calls.length,0);h.respond(null);await tick();assert.equal(calls.length,0);
  button.props.onClick();assert.equal(calls.length,0);h.respond({motivo:'Motivo sintético QA'});await tick();
  assert.equal(calls.length,1);assert.equal(calls[0][0],'pedido/42/activity-qa/');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])),{accion:'solicitar',motivo:'Motivo sintético QA'});
  assert.equal(h.notices[0][0],'Solicitud de anulación registrada.');
});

for(const action of ['registrar_pago','rechazar_pago','registrar_devolucion','reembolsar_webpay'])test(action+': cerrar no opera; confirmar conserva motivo, comprobante y medio de pago',async()=>{
  const calls=[],refund=action==='registrar_devolucion'||action==='reembolsar_webpay';
  const row={id:'activity-qa',pedido_id:42,pedido:'QA-42',titulo:'Taller QA',modo:action==='reembolsar_webpay'?'webpay':'transfer',pedido_estado:refund?'pagado':'pendiente',estado:refund?'confirmada':'en_pago',importe:5000,devolucion:{estado:refund?'autorizada':''},reembolso_total_webpay:true};
  const h=harness('src/features/admin/components/PaidActivitySalesQA.tsx','PaidActivitySalesQA',[{items:[row]},1,0,'','',true],{
    '../../landing/services/activitySalesQA':{saleMoney:String,saleDate:String,saleState:()=>'',salesQA:async(...args)=>{calls.push(args);if(action==='reembolsar_webpay')throw Error('Reembolso pendiente de revisión QA');}},
  });
  const names={registrar_pago:'Verifiqué el abono',rechazar_pago:'Rechazar pago revisado',registrar_devolucion:'Registrar devolución realizada',reembolsar_webpay:'Devolver por Webpay'};
  const button=h.button(h.render(),names[action]);
  button.props.onClick();assert.equal(calls.length,0);h.respond(null);await tick();assert.equal(calls.length,0);
  button.props.onClick();assert.equal(calls.length,0);
  assert.equal(h.options.fields.some(field=>field.name==='referencia'),action!=='reembolsar_webpay');
  h.respond({motivo:'Motivo QA',referencia:'Comprobante QA'});await tick();
  assert.equal(calls.length,1);assert.equal(calls[0][0],'pedido/42/activity-qa/');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])),{accion:action,motivo:'Motivo QA',...(action!=='reembolsar_webpay'?{referencia:'Comprobante QA'}:{})});
  if(action==='reembolsar_webpay')assert.deepEqual(h.notices,[['Reembolso pendiente de revisión QA','error']]);
});
