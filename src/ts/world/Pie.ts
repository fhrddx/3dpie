import { AmbientLight, AxesHelper, Color, DirectionalLight, ExtrudeGeometry, Group, Mesh, MeshPhongMaterial, OrthographicCamera, Raycaster, Scene, Shape, Sprite, SpriteMaterial, TextureLoader, Vector2, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { Basic } from './Basic'
import Sizes from '../Utils/Sizes'
import { Resources } from './Resources';
import html2canvas from "html2canvas";
import { IPie } from "../interfaces/IPie";

export default class Pie {
  //option 是外部传进来的，有一个属性dom，并保存起来
  public option: IPie;

  //通过Basic封装，生成 scene、camera、renderer、controls 这4个three.js最重要的概念
  public scene: Scene;
  public camera: OrthographicCamera;
  public renderer: WebGLRenderer
  public controls: OrbitControls;

  //整体的一个group
  public group: Group;
  public spriteList: Sprite[];
  //尺寸监听器
  public sizes: Sizes;
  //资源加载器
  public resources: Resources;

  private clientWidth: number;
  private clientHeight: number;

  //相关的点击事件
  private mouse: Vector2;
  private raycaster: Raycaster;

  constructor(option: IPie) {
    //处理下传进来的数据
    this.option = option;
    const pieChartContainer = option.dom;
    this.clientHeight = pieChartContainer.clientHeight;
    this.clientWidth = pieChartContainer.clientWidth;

    //用一个group来存放需要旋转的物品
    this.group = new Group();
    this.spriteList = [];

    //通过Basic封装，生成 scene、camera、renderer、controls 这4个three.js最重要的概念
    const basic = new Basic(option.dom, this.clientWidth, this.clientHeight);
    this.scene = basic.scene;
    this.camera = basic.camera;
    this.renderer = basic.renderer;
    this.controls = basic.controls;

    //加上辅助线
    const axesHelper = new AxesHelper(200);
    this.scene.add(axesHelper);
    
    //监听可视范围的尺寸
    this.sizes = new Sizes({ dom: option.dom })
    this.sizes.$on('resize', () => {
      const width = Number(this.sizes.viewport.width);
      const height = Number(this.sizes.viewport.height);
      const newSize = Math.min(width, height);
      //第1步，渲染器改变下长度、宽度，这样就不会被遮挡，会充满整个父容器
      this.renderer.setSize(width, height);
      //第2步，相机重新设置下长宽比, 否则成相会被压缩或者拉长，就会很难看
      this.camera.left = -width / 2;
			this.camera.right = width / 2;
			this.camera.top = height / 2;
			this.camera.bottom = - height / 2;
      this.camera.updateProjectionMatrix();
      //第3步，将整个世界同步放大
      const scale = newSize / this.group.userData['size'] * this.group.userData['scale'];
      this.group.scale.set(scale, scale, scale)
      this.group.userData['scale'] = scale;
      this.group.userData['size'] = Math.min(width, height);
      //第4步，由于整个group被放大了scale倍数，但是精灵的标注，不应该跟随界面缩放，所以group被放大的同时，精灵要同倍数缩小
      if(this.spriteList && this.spriteList.length > 0){
        this.spriteList.forEach(s => {
          const newScaleX = s.userData['scale'][0] / scale;
          const newScaleY =  s.userData['scale'][1] / scale;
          s.scale.set(newScaleX, newScaleY, 1);
        })
      }
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

  //创建饼形图
  createPieChart(){
    const data = [{ label: '正常电站', value: 500 }, { label: '断链电站', value: 440 }, { label: '告警电站', value: 320 }];
    const colors = ['#4f87b8', '#d06c34', '#8f8f8f', '#dea72f', '#3b64a7', '#639746', '#96b7db', '#Eca5bc', '#d06c34', '#8f8f8f', '#dea72f', '#3b64a7', '#639746', '#96b7db', '#Eca5bc'];
    const size = Math.min(this.clientHeight, this.clientWidth);
    const maxDeep = size / 10;
    const minDeep = maxDeep * 0.6;
    const innerR = size / 4;
    const outerR = innerR * 3 / 2;
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
        deep: minDeep + (maxDeep - minDeep) * ((data[i].value - min) / (max - min)),
        value: data[i].value
      })
      startAngle = endAngle;
    }
    list.forEach(async (item) => {
      await this.createSector(outerR, innerR, item.startAngle, item.endAngle, item.deep, item.color, item.value);
    })
    this.group.userData['size'] = size;
    this.group.userData['scale'] = 1;
    this.scene.add(this.group);
  }

  //创建一个弧形柱体
  async createSector(outRadius, innerRadius, startAngle, endAngle, depth, color, value) {
    const shape = new Shape();
    shape.moveTo(outRadius, 0);
    shape.absarc(0, 0, outRadius, endAngle - startAngle, 0, true);
    shape.absarc(0, 0, innerRadius, 0, endAngle - startAngle, false);

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
    const material = new MeshPhongMaterial({ color: new Color(color), opacity: 0.94, transparent: true });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(0, 0, 0);
    //旋转扇形以对齐其角度
    mesh.rotateZ(startAngle);
    //旋转90度，使第一个扇形从下边的中点开始
    mesh.rotateZ(-Math.PI / 2);

    //生成html
    const div = `<div class="category"><span class="color1"></span><div>${value}</div></div>`;
    const shareContent = document.getElementById("html2canvas");
    shareContent.innerHTML = div;
    //将以上的 html 转化为 canvas，再将 canvas 转化为贴图
    const opts = {
      //注解：这样表示背景透明
      backgroundColor: null,
      dpi: window.devicePixelRatio
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
    //把这个标签放在这个弧线的中心
    const beishu = 1.35;
    sprite.position.set(outRadius * beishu * Math.cos((endAngle - startAngle) / 2), outRadius * beishu * Math.sin((endAngle - startAngle) / 2), depth);
    //根据文字长度，动态设置精灵的大小
    const scaleX = 27 + (value + '').length * 13.5;
    const scaleY = 33;
    sprite.scale.set(scaleX, scaleY, 1);
    //给精灵自定义一些数据，方便后面放大缩小
    sprite.userData['scale'] = [scaleX, scaleY];
    //spriteList方便后面遍历3d世界中的精灵
    this.spriteList.push(sprite);
    //加入各自的组织当中
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