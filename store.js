import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getFirestore, doc, onSnapshot, collection, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { firebaseConfig, DEFAULTS } from './firebase-config.js';
const db = getFirestore(initializeApp(firebaseConfig));
const $ = id => document.getElementById(id);
const money = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
let settings = {...DEFAULTS}, products = [], cart = [], current = null, sending=false;
let mobileCategory='Todas',mobileSearchText='';
const safeUrl = u => /^https:\/\//i.test(String(u || '')) ? u : '';
function normalized(d,id){return {id,name:d.name||d.nombre||'Producto',category:d.category||d.categoria||'Otros',price:Number(d.price??d.precio??0),description:d.description||d.descripcion||d.ingredientes||'',imageUrl:d.imageUrl||d.imagenUrl||d.fotoUrl||d.image||d.imagen||'',videoUrl:d.videoUrl||d.video||'',extras:Array.isArray(d.extras)?d.extras:[],available:d.available!==false&&d.disponible!==false};}
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x;}
function media(p){let url=safeUrl(p.imageUrl),v=safeUrl(p.videoUrl);if(url){const img=el('img');img.src=url;img.alt=p.name;img.loading='lazy';return img;}if(v){const vid=el('video');vid.src=v;vid.controls=true;vid.preload='none';return vid;}return null;}
function openVideo(p){const url=safeUrl(p.videoUrl);if(!url)return;$('videoTitle').textContent='🎬 '+p.name;const v=$('productVideo');v.src=url;v.muted=false;v.volume=1;v.controls=true;v.load();$('videoDialog').showModal();}
$('closeVideo').onclick=()=>$('videoDialog').close();
$('productVideo').muted=false;
$('promoExplore').onclick=()=>document.getElementById('menu').scrollIntoView({behavior:'smooth'});
$('promoVideoButton').onclick=()=>openVideo({name:settings.promoTitle||'Promoción de la semana',videoUrl:settings.promoVideo});
$('videoDialog').addEventListener('close',()=>{const v=$('productVideo');v.pause();v.removeAttribute('src');v.load();});
function renderMenu(){const menu=$('menu');menu.replaceChildren();const available=products.filter(p=>p.available && (mobileCategory==='Todas'||p.category===mobileCategory) && (!mobileSearchText || (p.name+' '+p.description+' '+p.category).toLocaleLowerCase('es').includes(mobileSearchText)));if(!available.length){$('status').className='notice';$('status').textContent=products.length?'No hay productos para esta búsqueda.':'Aún no hay productos disponibles.';return;}$('status').classList.add('hidden');const groups=new Map();available.forEach(p=>{const cat=p.category||'Otros';if(!groups.has(cat))groups.set(cat,[]);groups.get(cat).push(p);});for(const [cat,items] of groups){menu.append(el('h2','',cat));const grid=el('div','grid');for(const p of items){const card=el('article','product');const m=media(p);if(m)card.append(m);const content=el('div','content');content.append(el('h3','',p.name),el('p','muted',Array.isArray(p.description)?p.description.join(', '):p.description),el('p','price',p.price>0?money(p.price):'Consultar precio'));if(safeUrl(p.videoUrl)){const vb=el('button','video-button','▶ Ver video del producto');vb.type='button';vb.onclick=()=>openVideo(p);content.append(vb);}const b=el('button','','Personalizar y pedir');b.onclick=()=>openCustom(p);content.append(b);card.append(content);grid.append(card);}menu.append(grid);}}
function openCustom(p){
 current=p;
 $('customTitle').textContent=p.name;
 $('customDesc').textContent=Array.isArray(p.description)?p.description.join(', '):p.description||'';
 $('qty').value=1;$('customNotes').value='';
 $('onionOption').value='Con cebolla';
 const extras=$('extras');extras.replaceChildren();
 // Los precios de estos complementos son sugeridos; se pueden ajustar por producto
 // desde Administración > Productos > Editar > Adicionales.
 const suggestions=[
  {name:'Papas adicionales',price:4000},
  {name:'Salsa extra',price:2000},
  {name:'Gaseosa',price:4000}
 ];
 const configured=Array.isArray(p.extras)?p.extras.filter(e=>e&&e.name):[];
 const norm=x=>String(x||'').trim().toLocaleLowerCase('es');
 const choices=[...configured];
 for(const ex of suggestions){if(!choices.some(x=>norm(x.name)===norm(ex.name)))choices.push(ex);}
 for(const ex of choices){
  const label=el('label','checkline');const inp=el('input');inp.type='checkbox';
  inp.dataset.name=ex.name;inp.dataset.price=Number(ex.price)||0;
  inp.onchange=updateCustomPrice;
  label.append(inp,document.createTextNode(' '+ex.name+' (+'+money(ex.price)+')'));
  extras.append(label);
 }
 extras.append(el('p','extra-note','Puedes cambiar los precios de los adicionales en Administración → Productos → Editar.'));
 updateCustomPrice();$('customDialog').showModal();
}
function selectedExtras(){return [...$('extras').querySelectorAll('input:checked')].map(i=>({name:i.dataset.name,price:Number(i.dataset.price)}));}
function updateCustomPrice(){if(!current)return;const qty=Math.min(30,Math.max(1,Number($('qty').value)||1));$('customPrice').textContent='Subtotal: '+money(qty*(current.price+selectedExtras().reduce((s,e)=>s+e.price,0)));}
$('qty').oninput=updateCustomPrice;
$('cancelCustom').onclick=()=>$('customDialog').close();
$('addCustom').onclick=()=>{if(!current)return;const qty=Math.min(30,Math.max(1,Math.floor(Number($('qty').value)||1)));cart.push({productId:current.id,name:current.name,price:current.price,extras:selectedExtras(),qty,notes:[$('onionOption').value,$('customNotes').value.trim()].filter(Boolean).join(' · ')});$('customDialog').close();renderCart();$('addedDialog').showModal();};
$('keepShopping').onclick=()=>$('addedDialog').close();
$('viewCart').onclick=()=>{$('addedDialog').close();showCart();};
$('orderFromAdded').onclick=()=>{
 $('addedDialog').close();
 if(!canOrder()){showCart();alert('El negocio no está recibiendo pedidos en este horario. Puedes revisar tu carrito.');return;}
 if(!cart.length){showCart();return;}
 updateCheckout();$('checkoutDialog').showModal();
};
$('goCart').onclick=showCart;
function goHome(){for(const id of ['customDialog','addedDialog','cartDialog','checkoutDialog','videoDialog']){const d=$(id);if(d.open)d.close();}window.scrollTo({top:0,behavior:'smooth'});}
$('goHome').onclick=goHome;
$('returnToStore').onclick=goHome;
function cancelEverything(){if(!confirm('¿Cancelar todo el pedido y vaciar el carrito?'))return;cart=[];$('checkoutForm').reset();$('orderStatus').textContent='';$('addressWrap').classList.remove('hidden');$('address').required=true;renderCart();setInterval(updateHours,60000);goHome();}
$('clearCart').onclick=cancelEverything;
$('cancelOrder').onclick=cancelEverything;
$('shareStore').onclick=async()=>{const publicUrl=window.location.href;if(['localhost','127.0.0.1'].includes(window.location.hostname)){alert('Tu tienda está abierta en modo local. Para compartirla con amigos necesitas primero publicarla en una dirección web pública.');return;}const text='🍔 ¡Te recomiendo El Jota Comelón! Mira su carta y pide aquí: '+publicUrl;if(navigator.share){try{await navigator.share({title:'El Jota Comelón',text:'¡Te recomiendo El Jota Comelón!',url:publicUrl});return;}catch(e){if(e.name==='AbortError')return;}}window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener,noreferrer');};
$('continueShopping').onclick=()=>$('cartDialog').close();
$('openCheckout').onclick=()=>{if(!canOrder()){alert('El negocio está cerrado. Revisa el horario de atención.');return;}if(!cart.length){alert('Primero agrega un producto al carrito.');return;}$('cartDialog').close();updateCheckout();$('checkoutDialog').showModal();};
$('backToCart').onclick=()=>{$('checkoutDialog').close();showCart();};
function showCart(){renderCart();$('cartDialog').showModal();}
function itemPrice(i){return i.qty*(i.price+i.extras.reduce((a,e)=>a+e.price,0));}
function totals(){const subtotal=cart.reduce((s,i)=>s+itemPrice(i),0);const delivery=cart.length&&$('deliveryType').value==='domicilio'?Number(settings.deliveryFee)||0:0;return {subtotal,delivery,total:subtotal+delivery};}
function updateCheckout(){const t=totals();$('checkoutSubtotal').textContent=money(t.subtotal);$('checkoutDelivery').textContent=money(t.delivery);$('checkoutTotal').textContent=money(t.total);}
function renderCart(){const target=$('cartItems');target.replaceChildren();let count=0;cart.forEach((i,index)=>{count+=i.qty;const div=el('div','item');div.append(el('strong','',`${i.qty} × ${i.name}`),el('p','small muted',i.extras.map(e=>e.name).join(', ')+(i.notes?' · '+i.notes:'')),el('span','price',money(itemPrice(i))));const actions=el('div','actions');const minus=el('button','btn-alt','−');minus.type='button';minus.setAttribute('aria-label','Disminuir cantidad');minus.onclick=()=>{i.qty--;if(i.qty<=0)cart.splice(index,1);renderCart();};const plus=el('button','btn-alt','+');plus.type='button';plus.setAttribute('aria-label','Aumentar cantidad');plus.onclick=()=>{i.qty=Math.min(30,i.qty+1);renderCart();};const rm=el('button','btn-alt','Quitar');rm.type='button';rm.onclick=()=>{cart.splice(index,1);renderCart();};actions.append(minus,plus,rm);div.append(actions);target.append(div);});if(!cart.length)target.append(el('p','muted','Tu carrito está vacío.'));$('count').textContent=count;if($('mobileCount'))$('mobileCount').textContent=count;const t=totals();$('subtotal').textContent=money(t.subtotal);$('delivery').textContent=money(t.delivery);$('total').textContent=money(t.total);$('openCheckout').disabled=!cart.length||!canOrder();updateCheckout();}
$('deliveryType').onchange=()=>{$('addressWrap').classList.toggle('hidden',$('deliveryType').value==='recoger');$('address').required=$('deliveryType').value==='domicilio';renderCart();};
function bogotaParts(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());const get=k=>parts.find(p=>p.type===k)?.value||'';return {day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday')),minutes:Number(get('hour'))%24*60+Number(get('minute'))};}
function scheduleAllows(){const {day,minutes}=bogotaParts(),days=settings.workingDays||[0,1,2,3,4,5,6];const parse=t=>{const [h,m]=String(t).split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null;};const a=parse(settings.openTime||'17:00'),b=parse(settings.closeTime||'23:00');if(a===null||b===null)return true;if(a===b)return days.includes(day);if(a<b)return days.includes(day)&&minutes>=a&&minutes<b;return (days.includes(day)&&minutes>=a)||(days.includes((day+6)%7)&&minutes<b);}
function canOrder(){return settings.shiftOpen===true&&!!settings.activeShiftId&&scheduleAllows();}
function updateHours(){const b=$('hoursBanner');const open=canOrder();b.className='notice '+(open?'shift-open':'shift-closed');b.textContent=(open?'🟢 Abierto · Recibimos pedidos':'🔴 Cerrado · Puedes mirar la carta')+' · Horario '+(settings.openTime||'17:00')+' a '+(settings.closeTime||'23:00')+' (Colombia)';if(!settings.shiftOpen)b.textContent+=' · Jornada aún no abierta';renderCart();}
$('checkoutForm').onsubmit=async e=>{e.preventDefault();if(sending)return;const customer=$('customer').value.trim(),phone=$('phone').value.trim(),address=$('address').value.trim(),kind=$('deliveryType').value;if(!cart.length||!customer||!phone||(kind==='domicilio'&&!address)){$('orderStatus').className='notice error';$('orderStatus').textContent='Agrega productos y completa nombre, teléfono y dirección si es domicilio.';return;}if(!canOrder()){$('orderStatus').className='notice error';$('orderStatus').textContent='No estamos recibiendo pedidos en este momento. Consulta el horario.';return;}const wa=String(settings.whatsapp||DEFAULTS.whatsapp||'').replace(/\D/g,'');if(!wa){$('orderStatus').className='notice error';$('orderStatus').textContent='Configura WhatsApp en administración.';return;}
const t=totals(),items=cart.map(i=>({...i,extras:i.extras.map(x=>({...x}))})),notes=$('notes').value.trim(),payment=$('payment').value;const lines=items.map(i=>`${i.qty} x ${i.name} (${money(i.price)})${i.extras.length?'\n  Extras: '+i.extras.map(e=>`${e.name} (+${money(e.price)})`).join(', '):''}${i.notes?'\n  Nota: '+i.notes:''}\n  Subtotal: ${money(itemPrice(i))}`);
// Abrimos la pestaña por acción directa del cliente para evitar bloqueadores de ventanas.
const tab=window.open('about:blank','_blank');sending=true;$('checkout').disabled=true;$('orderStatus').className='notice';$('orderStatus').textContent='Registrando tu solicitud y asignando número de pedido...';
try{const settingsRef=doc(db,'settings','public');const result=await runTransaction(db,async tx=>{const ss=await tx.get(settingsRef);const cfg=ss.data()||{};if(cfg.shiftOpen!==true||!cfg.activeShiftId)throw new Error('La jornada está cerrada.');const shiftId=cfg.activeShiftId;const counterRef=doc(db,'shifts',shiftId,'counters','orders');const counterSnap=await tx.get(counterRef);const n=(counterSnap.exists()?Number(counterSnap.data().seq)||0:0)+1;const orderRef=doc(collection(db,'orders'));tx.set(counterRef,{shiftId,seq:n,updatedAtMs:Date.now()});tx.set(orderRef,{shiftId,orderNumber:n,customer,phone,address:kind==='domicilio'?address:'',deliveryType:kind,payment,notes,items,details:lines.join(' | '),subtotal:t.subtotal,delivery:t.delivery,total:t.total,status:'pendiente',paid:false,source:'web',createdAt:serverTimestamp(),createdAtMs:Date.now()});return {n,orderId:orderRef.id};});
const number=String(result.n).padStart(3,'0');try{sessionStorage.setItem('jotaLastOrder',JSON.stringify({number,total:t.total,date:new Date().toLocaleString('es-CO'),customer}));}catch(_){}const msg=`🍔 *PEDIDO #${number} · EL JOTA COMELÓN*\n\n${lines.join('\n\n')}\n\nProductos: ${money(t.subtotal)}\nDomicilio: ${money(t.delivery)}\n*TOTAL ESTIMADO: ${money(t.total)}*\n\nCliente: ${customer}\nTeléfono: ${phone}\nEntrega: ${kind}\nDirección: ${kind==='domicilio'?address:'Recoge en el negocio'}\nPago: ${payment}\nObservaciones: ${notes||'Ninguna'}\n\nPor favor confirma recepción, disponibilidad y tiempo de entrega.`;const url=`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;if(tab)tab.location.href=url;else{const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Abrir WhatsApp para enviar el pedido #'+number;link.style.display='block';$('orderStatus').replaceChildren(link);}
if(tab){$('orderStatus').className='notice success';$('orderStatus').textContent='Solicitud #'+number+' registrada. En WhatsApp debes pulsar Enviar; el negocio confirmará el pedido. No se contabiliza como venta hasta que se marque entregado y pagado.';}
}catch(err){if(tab)tab.close();$('orderStatus').className='notice error';$('orderStatus').textContent='No se registró el pedido: '+(err.message||err.code||'Error desconocido')+'. No se abrió WhatsApp. Revisa las reglas de Firestore.';}finally{sending=false;$('checkout').disabled=false;}};
onSnapshot(doc(db,'settings','public'),snap=>{settings={...DEFAULTS,...(snap.exists()?snap.data():{})};$('brand').textContent=String(settings.name||'El Jota Comelón').toUpperCase();$('slogan').textContent=settings.slogan||'';$('city').textContent=settings.city||'';$('footerCity').textContent=settings.city||'';const payment=$('payment');payment.replaceChildren();for(const name of String(settings.paymentMethods||'Nequi, Efectivo').split(',').map(s=>s.trim()).filter(Boolean)){const o=el('option','',name);o.value=name;payment.append(o);}const h=$('hero'),hm=$('heroMedia');hm.replaceChildren();const img=safeUrl(settings.heroImage),vid=safeUrl(settings.heroVideo);if(img||vid){h.classList.remove('hidden');if(img){const e=el('img');e.src=img;hm.append(e);}else{const e=el('video');e.src=vid;e.controls=true;hm.append(e);}}else h.classList.add('hidden');renderPromotion();updateHours();},e=>console.warn('Configuración:',e));
onSnapshot(collection(db,'products'),snap=>{products=snap.docs.map(d=>normalized(d.data(),d.id));renderMobileCategories();renderMenu();},e=>{$('status').className='notice error';$('status').textContent='No se pudieron leer los productos: '+e.code+'. Revisa las reglas de Firestore.';});
$('address').required=true;renderCart();setInterval(updateHours,60000);

function renderPromotion(){const section=$('promotion'),media=$('promoMedia'),watch=$('promoVideoButton');media.replaceChildren();const image=safeUrl(settings.promoImage),video=safeUrl(settings.promoVideo);const enabled=settings.promoEnabled===true;section.classList.toggle('hidden',!enabled);if(!enabled)return;$('promoHeading').textContent=settings.promoTitle||'Promoción de la semana';$('promoText').textContent=settings.promoDescription||'¡Descubre nuestra oferta especial!';watch.classList.toggle('hidden',!video);if(image){const img=el('img');img.src=image;img.alt='Imagen de la promoción';img.loading='lazy';media.append(img);}else if(video){const preview=el('video');preview.src=video;preview.preload='metadata';preview.muted=true;preview.playsInline=true;preview.controls=false;preview.setAttribute('aria-label','Vista previa del video de promoción');media.append(preview);const play=el('button','promo-play','▶ Reproducir con sonido');play.type='button';play.onclick=()=>openVideo({name:settings.promoTitle||'Promoción de la semana',videoUrl:video});media.append(play);}else{media.append(el('div','promo-placeholder','🍔🔥'));}}

// Navegación exclusiva para pantallas pequeñas: no modifica el panel administrativo.
function renderMobileCategories(){const target=$('mobileCategories');if(!target)return;target.replaceChildren();const cats=['Todas',...new Set(products.filter(p=>p.available).map(p=>p.category))];if(!cats.includes(mobileCategory))mobileCategory='Todas';for(const cat of cats){const b=el('button',cat===mobileCategory?'selected':'',({Todas:'🍽️',Hamburguesas:'🍔',Perros:'🌭',Asados:'🥩',Bebidas:'🥤'}[cat]||'🍴')+' '+cat);b.type='button';b.onclick=()=>{mobileCategory=cat;renderMobileCategories();renderMenu();$('menu').scrollIntoView({behavior:'smooth',block:'start'});};target.append(b);}}
$('mobileHome').onclick=()=>{mobileCategory='Todas';mobileSearchText='';$('mobileSearch').value='';$('mobileSearchWrap').classList.add('hidden');renderMobileCategories();renderMenu();goHome();};
$('mobileFind').onclick=()=>{$('mobileSearchWrap').classList.remove('hidden');$('mobileSearchWrap').scrollIntoView({behavior:'smooth',block:'center'});$('mobileSearch').focus();};
$('mobileSearch').oninput=()=>{mobileSearchText=$('mobileSearch').value.trim().toLocaleLowerCase('es');renderMenu();};
$('mobileCart').onclick=showCart;
$('mobileOrders').onclick=()=>{const d=$('myOrdersContent');d.replaceChildren();let last=null;try{last=JSON.parse(sessionStorage.getItem('jotaLastOrder')||'null');}catch(_){}if(last){d.append(el('p','','Última solicitud registrada en este navegador: #'+last.number),el('p','','Cliente: '+last.customer),el('p','','Fecha: '+last.date),el('p','price',money(last.total)),el('p','muted','Para conocer el estado actual, consulta con el negocio por WhatsApp.'));}else{d.append(el('p','','Todavía no hay un pedido registrado en esta sesión.'),el('p','muted','Cuando completes un pedido, verás aquí su número de solicitud.'));}$('myOrdersDialog').showModal();};
$('closeMyOrders').onclick=()=>$('myOrdersDialog').close();
