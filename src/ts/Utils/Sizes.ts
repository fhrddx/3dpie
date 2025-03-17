import { EventEmitter } from 'pietile-eventemitter';
import { IEvents } from '../interfaces/IEvents';

type options = { dom: HTMLElement }

//注解：已掌握
export default class Sizes {
  //注解：构造函数传入的dom元素
  public $sizeViewport: HTMLElement
  //注解：存放dom元素的尺寸
  public viewport: {
    width: number,
    height: number
  }
  //注解：尺寸监听器
  public emitter: EventEmitter<IEvents>;

  //注解：构造函数，参数包含一个dom属性
  constructor(options: options) {
    //注解：构造函数传入的dom元素，并保留下来
    this.$sizeViewport = options.dom;

    //注解：存放dom元素的尺寸
    this.viewport = {
      width: 0,
      height: 0
    };

    //注解：尺寸监听器初始化
    this.emitter = new EventEmitter<IEvents>()

    //注解：添加resize监听
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  /**
   * 目前用于监听历史记录执行 historyChange
   * @param event 事件
   * @param fun 执行
   */
  $on<T extends keyof IEvents>(event: T, fun: () => void) {
    this.emitter.on(
      event,
      () => {
        fun();
      }
    )
  }

  resize() {
    //注解：可视区域大小改变时，记录下这个新的数据
    this.viewport.width = this.$sizeViewport.offsetWidth;
    this.viewport.height = this.$sizeViewport.offsetHeight;
    //注解：发送通知，执行回调函数
    this.emitter.emit('resize');
  }
}
