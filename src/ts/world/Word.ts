import { AxesHelper, PerspectiveCamera, Raycaster, Scene, Vector2, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { IWord } from '../interfaces/IWord'
import { Basic } from './Basic'
import Sizes from '../Utils/Sizes'
import { Resources } from './Resources';
import Earth from './Earth'
import Data from './Data'

//注解：three.js 创建一个 3d 场景，并加入物体
export default class World {
  //注解：option 是外部传进来的，有一个属性dom，并保存起来
  public option: IWord;

  //注解：通过Basic封装，生成 scene、camera、renderer、controls 这4个three.js最重要的概念
  public scene: Scene;
  public camera: PerspectiveCamera;
  public renderer: WebGLRenderer
  public controls: OrbitControls;

  //注解：尺寸监听器
  public sizes: Sizes;
  //注解：资源加载器
  public resources: Resources;
  //注释：最重要的mesh
  public earth: Earth;

  //注解：相关的点击事件
  private mouse: Vector2;
  private raycaster: Raycaster;

  constructor(option: IWord) {
    //注解：option 是外部传进来的，有一个属性dom，并保存起来
    this.option = option;

    //注解：通过Basic封装，生成 scene、camera、renderer、controls 这4个three.js最重要的概念
    const basic = new Basic(option.dom);
    this.scene = basic.scene;
    this.camera = basic.camera;
    this.renderer = basic.renderer;
    this.controls =basic.controls;
    
    //注解：加上辅助线，试一下（红色X轴，绿色Y轴，蓝色Z轴）
    //const axesHelper = new AxesHelper(200);
    //this.scene.add(axesHelper);
    
    //注解：监听可视范围的尺寸
    this.sizes = new Sizes({ dom: option.dom })
    this.sizes.$on('resize', () => {
      //注解：第1步，渲染器改变下长度、宽度，这样就不会被遮挡，会充满整个父容器
      this.renderer.setSize(Number(this.sizes.viewport.width), Number(this.sizes.viewport.height));
      //注解：第2步，相机重新设置下长宽比, 否则成相会被压缩或者拉长，就会很难看
      this.camera.aspect = Number(this.sizes.viewport.width) / Number(this.sizes.viewport.height);
      this.camera.updateProjectionMatrix();
    })

    //注解：加载完图片，创建地球，然后每一帧更新一下
    this.resources = new Resources(async () => {
      //注解：创建地球
      await this.createEarth();
      //注解：创建地球之后，设置一下点击事件
      this.setEvents();
      //注解：分帧渲染
      this.render();
    })
  }

  //注解：渲染函数
  public render() {
    requestAnimationFrame(this.render.bind(this))
    this.renderer.render(this.scene, this.camera);
    this.controls && this.controls.update();
    //注解：这个render主要是让地球内部的相关物体都运动起来
    this.earth && this.earth.render();
  }

  //注解：创建地球这个物体
  async createEarth() {
    //注解：资源加载完成，开始制作地球
    this.earth = new Earth({
      data: Data,
      textures: this.resources.textures,
      earth: {
        radius: 50,
        rotateSpeed: 0.002,
        isRotation: true
      },
      satellite: {
        show: true,
        rotateSpeed: -0.01,
        size: 1,
        number: 2
      },
      punctuation: {
        circleColor: 0x3892ff,
        lightColumn: {
          //起点颜色
          startColor: 0x0d9ad5,
          //终点颜色
          endColor: 0xffffff,
        },
      },
      flyLine: {
        //飞线的颜色
        color: 0xf3ae76,
        //飞行线的颜色
        flyLineColor: 0xf0933d,
        //拖尾飞线的速度
        speed: 0.01, 
      }
    });
    this.scene.add(this.earth.group);
    await this.earth.init();

    //注解：隐藏loading
    const loading = document.querySelector('#loading')
    loading.classList.add('out')
  }

  //注解：添加相关的点击事件（存在优化的地方：1、射线会穿过地球的另外一面 2、点击的时候，地球应该要暂停动画，这样效果更好）
  public setEvents(){
    this.mouse = new Vector2();
    this.raycaster  = new Raycaster();
    this.renderer.domElement.addEventListener('click',e => {
      //获取鼠标点击的位置
      const x = e.clientX;
      const y = e.clientY;
      //我们最终点击的位置,要用映射的方式传给射线,射线根据计算的比例，计算出实际发射射线的方向,再发出射线
      this.mouse.x = ( x / window.innerWidth ) * 2 - 1;
      this.mouse.y = - ( y / window.innerHeight ) * 2 + 1;
      //使用当前相机和映射点修改当前射线属性
      this.raycaster.setFromCamera(this.mouse, this.camera);
      // 计算物体和射线的焦点
      const intersects = this.raycaster.intersectObjects( this.earth.clickMesh );
      if(intersects && intersects.length > 0){
        const firstObj = intersects[0];
        const message = firstObj.object.userData;
        this.option.callback(message);
      }
    })
  }
}