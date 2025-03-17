import World  from './world/Word';

//注解：three.js 占用的空间
const dom: HTMLElement = document.querySelector('#earth-canvas');

//注解：回调事件处理
const callback = (params: any) => {
  alert(JSON.stringify(params));
}

//注解：初始化整个three.js空间
new World({
  dom,
  callback
})