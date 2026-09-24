import {S} from './core/state.js?v=2.0.11';
import {BUILD_ID} from './pwa-build.js?v=2.0.11';

let locked=null, aligned=!BUILD_ID, reloading=false, registration;
const safe=()=>!S||!!S.done;
export const pwaCanStart=()=>!locked&&aligned;
const rpc=(worker,type,timeout=15000)=>new Promise((resolve,reject)=>{
  const channel=new MessageChannel();
  const timer=setTimeout(()=>{channel.port1.close();reject(new Error('Worker timeout'));},timeout);
  channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};
  worker.postMessage({type},[channel.port2]);
});
function lock(transaction,expiresAt){
  locked=transaction;
  // A terminated worker / closed initiating tab must not strand other pages.
  setTimeout(()=>unlock(transaction),Math.max(0,expiresAt-Date.now()));
  for(const id of ['start','app','modal','alloc-full']){
    const el=document.getElementById(id);if(el)el.inert=true;
  }
}
function unlock(transaction){
  if(locked!==transaction)return;
  locked=null;
  for(const id of ['start','app','modal','alloc-full']){
    const el=document.getElementById(id);if(el)el.inert=false;
  }
}
function reload(){
  if(reloading||!safe())return;
  reloading=true;location.reload();
}

export async function initPWA(){
  const status=document.getElementById('pwa-status'),button=document.getElementById('pwa-action');
  const panel=document.getElementById('pwa-panel');
  const offline=document.getElementById('pwa-offline'),details=document.getElementById('pwa-details');
  const offlineLabel=document.getElementById('pwa-offline-label');
  const connection=document.getElementById('pwa-connection'),help=document.getElementById('pwa-help');
  let offlineState='checking',checkOffline=()=>{};
  const offlineStates={
    checking:['檢查離線狀態…','正在確認此瀏覽器的離線資源是否完整。'],
    preparing:['離線準備中','請保持連線，等待離線資源下載完成。'],
    activation:['離線待啟用','資源已下載完成。請在首頁或生涯結束後按「啟用離線模式」。'],
    ready:['可離線遊玩','此瀏覽器已備妥完整遊戲資源，可斷網後重新開啟同一網址，開始新生涯並玩到引退。'],
    unavailable:['離線尚未就緒','尚未確認完整的離線資源。請保持連線，並展開此按鈕重新檢查。']
  };
  const showOffline=(state,message)=>{
    offlineState=state;
    offline.dataset.state=state;
    offlineLabel.textContent=offlineStates[state][0];
    if(state==='ready'&&!navigator.onLine)offlineLabel.textContent+='・目前離線';
    connection.textContent=navigator.onLine?'目前已連線':'目前無網路連線';
    help.textContent=message||offlineStates[state][1];
  };
  offline.onclick=()=>{
    details.hidden=!details.hidden;
    offline.setAttribute('aria-expanded',String(!details.hidden));
    if(!details.hidden)checkOffline();
  };
  const placeStatus=()=>{
    const parent=document.getElementById('start').style.display==='none'
      ?document.getElementById('mid'):document.getElementById('start-footer');
    if(panel.parentElement!==parent)parent.prepend(panel);
  };
  new MutationObserver(placeStatus).observe(document.getElementById('start'),{attributes:true,attributeFilter:['style']});
  const show=(text,label,action)=>{
    status.textContent=text;button.hidden=!label;button.textContent=label||'';button.onclick=action||null;
    // The persistent button already conveys readiness; retain notices for setup/updates.
    status.hidden=text==='可離線使用';
  };
  showOffline('checking');
  const showConnection=()=>{
    showOffline(offlineState,help.textContent);
    checkOffline();
  };
  window.addEventListener('online',showConnection);
  window.addEventListener('offline',showConnection);
  if(!BUILD_ID){
    showOffline('unavailable','此版本尚未提供離線資源，請保持連線遊玩。');
    show('離線尚未就緒，可連線遊玩');return;
  }
  if(!('serviceWorker' in navigator)||!isSecureContext){
    aligned=true;showOffline('unavailable','此瀏覽器或開啟方式不支援離線功能，請使用支援的瀏覽器並以 HTTPS 開啟網站。');
    show('離線尚未就緒，可連線遊玩');return;
  }
  aligned=!navigator.serviceWorker.controller;
  let refreshId=0;
  const refresh=async()=>{
    const id=++refreshId;
    showOffline('checking');
    try{
      const controller=navigator.serviceWorker.controller;
      if(controller){
        const info=await rpc(controller,'PWA_STATUS');
        if(id!==refreshId)return;
        aligned=info.buildId===BUILD_ID;
        if(!aligned){
          showOffline('unavailable','目前頁面與離線版本不同，請回到首頁或生涯結束後套用版本，再確認離線狀態。');
          show('版本已備妥，回到首頁或生涯結束後套用','套用版本',reload);return;
        }
        showOffline(info.ok?'ready':'unavailable');
        show(info.ok?'可離線使用':'離線尚未就緒，請連線重新準備');
        if(info.ok)controller.postMessage({type:'PWA_LOADED'});
      }else{
        aligned=true; // First install must never interrupt an uncontrolled career.
        if(registration?.active){
          const info=await rpc(registration.active,'PWA_STATUS');
          if(id!==refreshId)return;
          showOffline(info.ok?'activation':'unavailable');
          if(info.ok)show('離線資源已備妥，首頁或生涯結束後可啟用','啟用離線模式',reload);
          else show('離線尚未就緒，請連線重新準備');
        }else{
          showOffline(registration?.installing?'preparing':'unavailable');
          show(registration?.installing?'正在下載離線資源，請保持連線':'離線尚未就緒，可連線遊玩');
        }
      }
      if(registration?.waiting)show('新版本可用；所有分頁須在首頁或生涯結束後更新','更新版本',async()=>{
        button.disabled=true;
        status.hidden=false;
        status.textContent='正在確認所有分頁…';
        try{
          const result=await rpc(registration.waiting,'PWA_UPDATE');
          if(!result.ok)show('更新已延後，請先完成其他分頁的生涯，再重試','重試更新',button.onclick);
        }catch{show('更新尚未完成，請稍後重試','重試',refresh);}
        finally{button.disabled=false;}
      });
    }catch{
      if(id!==refreshId)return;
      aligned=true;showOffline('unavailable');
      show('離線尚未就緒，可連線遊玩','重試',()=>registration?.update().then(refresh).catch(()=>{}));
    }
  };
  checkOffline=refresh;
  navigator.serviceWorker.addEventListener('message',event=>{
    const data=event.data;
    if(data?.type==='PWA_VERSION')event.ports[0]?.postMessage({buildId:BUILD_ID});
    if(data?.type==='PWA_PREPARE'){
      const ready=safe()&&data.expiresAt>Date.now()&&(!locked||locked===data.transaction);
      if(ready)lock(data.transaction,data.expiresAt);
      event.ports[0]?.postMessage({safe:ready,buildId:BUILD_ID});
    }
    if(data?.type==='PWA_CANCEL')unlock(data.transaction);
    if(data?.type==='PWA_ACTIVATED'){
      if(locked)reload();else refresh();
    }
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(locked)reload();else refresh();
  });
  try{
    const base=new URL('../',import.meta.url);
    registration=await navigator.serviceWorker.register(new URL('sw.js',base),{scope:base.href,updateViaCache:'none'});
    const watch=worker=>worker?.addEventListener('statechange',()=>{
      if(worker.state==='installed'||worker.state==='activated')refresh();
      if(worker.state==='redundant')refresh().then(()=>show('離線下載未完成；現有版本仍可使用','重試下載',()=>registration.update().then(refresh).catch(()=>{})));
    });
    watch(registration.installing);
    registration.addEventListener('updatefound',()=>{watch(registration.installing);refresh();});
    await refresh();
    window.addEventListener('online',()=>registration.update().then(refresh).catch(()=>{}));
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible')refresh();
    });
  }catch{
    if(navigator.serviceWorker.controller){await refresh();return;}
    aligned=true;showOffline('unavailable');
    show('離線尚未就緒，可連線遊玩；首頁或生涯結束後可重試','重試',reload);
  }
}
