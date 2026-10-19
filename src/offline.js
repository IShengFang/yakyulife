/* Independent of the simulation: a failed install must never stop a career. */
(()=>{
  const root=new URL('../',document.currentScript.src);
  const workerURL=new URL('sw.js',root).href;
  const $=id=>document.getElementById(id);
  const displayMode=matchMedia('(display-mode: standalone)');
  const standalone=()=>navigator.standalone===true||displayMode.matches;
  let installPrompt=null,installPending=false,appInstalled=false;
  let registration,ready=false,busy=false,lastError='',progress=null;
  let persistence='unknown';
  const supported=isSecureContext&&'serviceWorker' in navigator&&'caches' in window;
  const controlled=()=>navigator.serviceWorker?.controller?.scriptURL===workerURL;

  function renderInstall(){
    const installed=standalone()||appInstalled;
    $('webapp-install').disabled=installPending;
    $('webapp-install-label').textContent=installPending?'正在開啟安裝…':
      standalone()?'Web App 已啟用':installed?'Web App 已安裝':'安裝 Web App';
    $('webapp-install').querySelector('i').className='ph-bold '+(installed?'ph-check-circle':'ph-download-simple');
  }

  async function install(){
    if(installPending)return;
    if(standalone()||appInstalled||!installPrompt){open();return;}
    // A deferred browser prompt can only be used once and needs this click gesture.
    const prompt=installPrompt;
    installPrompt=null;installPending=true;renderInstall();
    try{await prompt.prompt();}
    catch{open();}
    finally{installPending=false;renderInstall();}
  }

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    installPrompt=event;renderInstall();
  });
  window.addEventListener('appinstalled',()=>{
    appInstalled=true;installPrompt=null;renderInstall();
  });
  displayMode.addEventListener('change',renderInstall);

  function render(){
    let text;
    if(!supported)text='離線模式需要 HTTPS 與支援此功能的瀏覽器。';
    else if(ready&&controlled())text=(navigator.onLine?'':'已離線 · ')+'可離線遊玩';
    else if(lastError)text=lastError;
    else if(!navigator.onLine)text='尚未完成離線下載，請連網後重試。';
    else if(progress)text=`正在下載離線檔案 ${progress.completed} / ${progress.total}…`;
    else text='正在準備離線模式…';
    $('offline-summary').textContent=text;
    $('offline-status').textContent=text;
    $('offline-summary').dataset.ready=String(ready&&controlled());
    $('offline-dialog').dataset.ready=String(ready&&controlled());
    const bar=$('offline-progress');
    bar.hidden=!progress||ready;
    if(progress){bar.max=progress.total;bar.value=progress.completed;}
    $('offline-update').hidden=!registration?.waiting;
    $('offline-prepare').disabled=!supported||busy;
    $('offline-prepare').textContent=busy?'正在檢查…':ready?'檢查下載與更新':'重試離線下載';
    $('offline-storage').textContent=persistence==='persistent'?'已啟用持久儲存。':
      persistence==='best-effort'?'已使用裝置儲存；系統尚未核准持久儲存。':
      persistence==='unsupported'?'瀏覽器未提供持久儲存申請；離線檔案仍會保存在裝置。':'';
  }

  async function checkPersistence(request=false){
    try{
      if(!navigator.storage?.persisted){persistence='unsupported';return;}
      let persisted=await navigator.storage.persisted();
      if(!persisted&&request&&navigator.storage.persist)persisted=await navigator.storage.persist();
      persistence=persisted?'persistent':'best-effort';
    }catch{persistence='unsupported';}
    finally{render();}
  }

  function ask(worker,type){
    return new Promise((resolve,reject)=>{
      if(!worker){reject(new Error('Offline worker is not active'));return;}
      const channel=new MessageChannel();
      const timeout=setTimeout(()=>{channel.port1.close();reject(new Error('Offline worker timed out'));},
        type==='PREPARE_OFFLINE'?180000:10000);
      channel.port1.onmessage=event=>{
        clearTimeout(timeout);channel.port1.close();resolve(event.data);
      };
      worker.postMessage({type},[channel.port2]);
    });
  }

  async function refresh(){
    const worker=controlled()?navigator.serviceWorker.controller:registration?.active;
    if(!worker){render();return;}
    try{
      const result=await ask(worker,'GET_OFFLINE_STATUS');
      ready=result.ready;progress=result;
      if(ready)lastError='';
      else lastError='離線檔案不完整，請連網後重試下載。';
    }catch{
      ready=false;lastError='無法確認離線檔案，請重試檢查。';
    }
    render();
  }

  const watched=new WeakSet();
  function watch(worker){
    if(!worker||watched.has(worker))return;
    watched.add(worker);
    worker.addEventListener('statechange',()=>{
      if(worker.state==='redundant'){
        if(!ready)lastError='下載未完成，請確認網路及裝置儲存空間後重試。';
        render();
      }else if(worker.state==='installed'||worker.state==='activated')refresh();
    });
  }

  async function register(){
    registration=await navigator.serviceWorker.register(workerURL,{scope:root.pathname,updateViaCache:'none'});
    registration.addEventListener('updatefound',()=>watch(registration.installing));
    watch(registration.installing);
    await refresh();
  }

  async function prepare(){
    if(!supported||busy)return;
    busy=true;lastError='';render();
    // User gesture and Home Screen use can improve WebKit's persistence heuristic.
    await checkPersistence(true);
    try{
      if(!registration?.active&&!registration?.installing)await register();
      const worker=controlled()?navigator.serviceWorker.controller:registration.active;
      if(worker){
        const result=await ask(worker,'PREPARE_OFFLINE');
        ready=result.ready;progress=result;lastError=result.error||'';
      }
      if(navigator.onLine&&!registration.installing)await registration.update();
      await refresh();
    }catch{
      if(!ready)lastError='下載未完成，請確認網路及裝置儲存空間後重試。';
    }finally{busy=false;render();}
  }

  function open(){
    const dialog=$('offline-dialog');
    if(!dialog.open)dialog.showModal();
    refresh();checkPersistence(standalone());
  }
  $('webapp-install').addEventListener('click',install);
  $('offline-open').addEventListener('click',open);
  $('offline-prepare').addEventListener('click',prepare);
  window.addEventListener('yakyulife:offline-details',open);
  window.addEventListener('offline',()=>{refresh();render();});
  window.addEventListener('online',()=>{if(!ready)prepare();else refresh();});
  // Re-read actual Cache Storage after an app suspension; never trust a localStorage flag.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('pageshow',()=>{renderInstall();refresh();});

  renderInstall();
  render();
  if(!supported)return;
  navigator.serviceWorker.addEventListener('controllerchange',()=>refresh());
  navigator.serviceWorker.addEventListener('message',event=>{
    if(event.source?.scriptURL!==workerURL||event.data?.type!=='OFFLINE_PROGRESS')return;
    if(event.data.failed){
      if(!ready)lastError='下載未完成，請確認網路及裝置儲存空間後重試。';
    }else if(!ready){progress=event.data;lastError='';}
    render();
  });
  checkPersistence(standalone());
  register().catch(()=>{
    lastError='離線模式尚未就緒，請連網後重試下載。';render();
  });
})();
