import { useEffect } from 'react';
import './App.css';
import Pie from './world/Pie';

function App() {
  useEffect(() => {
    //隐藏loading
    const loading = document.querySelector('#loading');
    if(loading){
      loading.classList.add('out');
    }
    //注解：three.js 占用的空间
    const dom: HTMLElement = document.querySelector('#pie-container')!;
    //注解：回调事件处理
    const callback = (params: any) => {
      console.log(JSON.stringify(params));
    }
    //注解：初始化整个three.js空间
    new Pie({
      dom,
      callback
    })
  }, [])

  return (
    <div>
      <div id="loading">
        <div className="sk-chase">
          <div className="sk-chase-dot"></div>
          <div className="sk-chase-dot"></div>
          <div className="sk-chase-dot"></div>
          <div className="sk-chase-dot"></div>
          <div className="sk-chase-dot"></div>
          <div className="sk-chase-dot"></div>
        </div>
        <div>加载资源中...</div>
      </div>
      <div id="html2canvas"></div>
      <div id="earth-canvas"></div>
      <div id="pie-container"></div>
    </div>
  );
}

export default App;
