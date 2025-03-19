import { AmbientLight, AxesHelper, BufferGeometry, Color, DirectionalLight, ExtrudeGeometry, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshPhongMaterial, PerspectiveCamera, Raycaster, Scene, Shape, Sprite, SpriteMaterial, TextureLoader, Vector2, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { IWord } from '../interfaces/IWord'
import { Basic } from './Basic'
import Sizes from '../Utils/Sizes'
import { Resources } from './Resources';
import html2canvas from "html2canvas";

export default class World {
  //option 是外部传进来的，有一个属性dom，并保存起来
  public option: IWord;

  //通过Basic封装，生成 scene、camera、renderer、controls 这4个three.js最重要的概念
  public scene: Scene;
  public camera: PerspectiveCamera;
  public renderer: WebGLRenderer
  public controls: OrbitControls;

  //整体的一个group
  public group: Group;
  //尺寸监听器
  public sizes: Sizes;
  //资源加载器
  public resources: Resources;

  //相关的点击事件
  private mouse: Vector2;
  private raycaster: Raycaster;

  constructor(option: IWord) {
    this.group = new Group();
    //option 是外部传进来的，有一个属性dom，并保存起来
    this.option = option;

    //通过Basic封装，生成 scene、camera、renderer、controls 这4个three.js最重要的概念
    const basic = new Basic(option.dom);
    this.scene = basic.scene;
    this.camera = basic.camera;
    this.renderer = basic.renderer;
    this.controls =basic.controls;

    //加上辅助线
    //const axesHelper = new AxesHelper(200);
    //this.scene.add(axesHelper);
    
    //监听可视范围的尺寸
    this.sizes = new Sizes({ dom: option.dom })
    this.sizes.$on('resize', () => {
      //第1步，渲染器改变下长度、宽度，这样就不会被遮挡，会充满整个父容器
      this.renderer.setSize(Number(this.sizes.viewport.width), Number(this.sizes.viewport.height));
      //第2步，相机重新设置下长宽比, 否则成相会被压缩或者拉长，就会很难看
      this.camera.aspect = Number(this.sizes.viewport.width) / Number(this.sizes.viewport.height);
      this.camera.updateProjectionMatrix();
    })

    //加载完图片，创建地球，然后每一帧更新一下
    this.resources = new Resources(async () => {
      //创建地球之后，设置一下点击事件
      this.setEvents();
      //分帧渲染
      this.render();
      //隐藏loading
      const loading = document.querySelector('#loading')
      loading.classList.add('out')
    })

    //添加灯光效果
    const ambientLight = new AmbientLight(0xffffff, 1);
    this.scene.add(ambientLight)
    //添加一个平行光
    const directionalLight = new DirectionalLight(0xffffff, 1);
    directionalLight.position.set(-200, 200, 200);
    this.scene.add(directionalLight);
    
    //创建饼形图
    this.createPieChart();
  }

  createPieChart(){
    const data = [{ label: '正常电站', value: 50 }, { label: '断链电站', value: 40 }, { label: '告警电站', value: 30 }];
    const colors = ['#4f87b8', '#d06c34', '#8f8f8f', '#dea72f', '#3b64a7', '#639746', '#96b7db', '#Eca5bc', '#d06c34', '#8f8f8f', '#dea72f', '#3b64a7', '#639746', '#96b7db', '#Eca5bc'];
    const maxDeep = 10;
    const minDeep = 6;
    const innerR = 20;
    const outerR = 30;
    //列表统计一下
    const list = [];
    let sum = 0;
    let min = data[0].value;
    let max = data[0].value;
    data.forEach(item => {
      sum += item.value;
      min = Math.min(min, item.value);
      max = Math.max(max, item.value);
    })
    let startAngle = 0;
    let endAngle = 0;
    for(let i = 0; i < data.length; i++){
      endAngle = startAngle + data[i].value / sum * Math.PI * 2;
      list.push({
        color: colors[i % colors.length],
        startAngle: startAngle,
        endAngle: endAngle,
        deep: minDeep + (maxDeep - minDeep) * ((data[i].value - min) / (max - min))
      })
      startAngle = endAngle;
    }
    list.forEach(async (item) => {
      await this.createSector(outerR, innerR, item.startAngle, item.endAngle, item.deep, item.color);
    })
    this.scene.add(this.group);
  }

  //创建一个弧形柱体
  async createSector(outRadius, innerRadius, startAngle, endAngle, depth, color) {
    const shape = new Shape();
    shape.moveTo(outRadius, 0);
    shape.absarc(0, 0, innerRadius, 0, endAngle - startAngle, false);
    shape.absarc(0, 0, outRadius, endAngle - startAngle, 0, true);

    const extrudeSettings = {
      //曲线分段数，数值越高曲线越平滑
      curveSegments: 60,
      depth: depth,
      bevelEnabled: false,
      bevelSegments: 9,
      steps: 2,
      bevelSize: 0,
      bevelThickness: 0
    };
    //创建扇形的几何体
    const geometry = new ExtrudeGeometry(shape, extrudeSettings);
    const material = new MeshPhongMaterial({ color: new Color(color), opacity: 0.99, transparent: true });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(0, 0, 0);
    //旋转扇形以对齐其角度
    mesh.rotateZ(startAngle);
    //旋转90度，使第一个扇形从下边的中点开始
    mesh.rotateZ(Math.PI / 2);

    //生成html
    const div = `<div class="category"><span class="color1"></span><div>200</div></div>`;
    const shareContent = document.getElementById("html2canvas");
    shareContent.innerHTML = div;
    //将以上的 html 转化为 canvas，再将 canvas 转化为贴图
    const opts = {
      //注解：这样表示背景透明
      backgroundColor: null,
      scale: 6,
      dpi: window.devicePixelRatio,
    };
    const canvas = await html2canvas(document.getElementById("html2canvas"), opts)
    const dataURL = canvas.toDataURL("image/png");
    const map = new TextureLoader().load(dataURL);

    //根据精灵材质，生成精灵
    const materials = new SpriteMaterial({
      map: map,
      transparent: true,
    });
    const sprite = new Sprite(materials);
    sprite.position.set(30, 30, 10);
    sprite.scale.set(20, 9, 1);
    mesh.add(sprite);
    this.group.add(mesh);
  }

  //渲染函数
  public render() {
    requestAnimationFrame(this.render.bind(this))
    this.renderer.render(this.scene, this.camera);
    this.controls && this.controls.update();
    //让整个饼状图转动起来
    this.group.rotation.z += 0.01;
  }

  //添加相关的点击事件（存在优化的地方：1、射线会穿过地球的另外一面 2、点击的时候，地球应该要暂停动画，这样效果更好）
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
      const intersects = this.raycaster.intersectObjects( this.scene.children );
      if(intersects && intersects.length > 0){
        const firstObj = intersects[0];
        const message = firstObj.object.userData;
        this.option.callback(message);
      }
    })
  }
}