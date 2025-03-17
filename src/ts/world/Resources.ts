/**
 * 资源管理和加载
 */
import { LoadingManager, Texture, TextureLoader } from 'three';
import { resources } from './Assets'

export class Resources {
  //注解：这是构造函数传入进来的回调函数，加载完毕触发的事件
  private callback: () => void;

  //注解：纹理加载器配置相关事件
  private manager: LoadingManager
  //注解：three.js 纹理加载器
  private textureLoader!: InstanceType<typeof TextureLoader>;
  //注解：保留最终加载的资源
  public textures: Record<string, Texture>;

  constructor(callback: () => void) {
    //注解：资源加载完成的回调
    this.callback = callback;
    //注解：管理加载状态
    this.setLoadingManager();
    //注解：贴图对象保留起来
    this.textures = {};
    //注解：开始加载所有的资源
    this.loadResources();
  }

  //注解：管理加载状态
  private setLoadingManager() {
    this.manager = new LoadingManager();
    //注解：开始加载
    this.manager.onStart = () => {
      console.log('开始加载资源文件')
    }
    //注解：正在进行中
    this.manager.onProgress = (url) => {
      console.log(`正在加载：${url}`)
    }
    //注解：加载完成
    this.manager.onLoad = () => {
      this.callback()
    }
    //注解：加载失败
    this.manager.onError = url => {
      console.log('加载失败：' + url)
    }
  }

  //注解：加载所有的资源，并保留在textures中
  private loadResources(): void {
    this.textureLoader = new TextureLoader(this.manager)
    resources.textures?.forEach((item) => {
      this.textureLoader.load(item.url, (t) => {
        this.textures[item.name] = t
      })
    })
  }
}
