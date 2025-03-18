import { AxesHelper, BufferGeometry, Color, ExtrudeGeometry, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshPhongMaterial, PerspectiveCamera, Raycaster, Scene, Shape, Vector2, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { IWord } from '../interfaces/IWord'
import { Basic } from './Basic'
import Sizes from '../Utils/Sizes'
import { Resources } from './Resources';
import Earth from './Earth'
import Data from './Data'
import { color } from "html2canvas/dist/types/css/types/color";
import { deepEqualsArray } from "@tweakpane/core";

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
    const axesHelper = new AxesHelper(200);
    this.scene.add(axesHelper);
    
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
      //注解：创建地球之后，设置一下点击事件
      this.setEvents();
      //注解：分帧渲染
      this.render();
      //注解：隐藏loading
      const loading = document.querySelector('#loading')
      loading.classList.add('out')
    })

    this.createPieChart();
  }

  createPieChart(){
    const data = [{ label: '正常电站', value: 50 }, { label: '断链电站', value: 40 }, { label: '告警电站', value: 30 }];
    const colors = ['#4f87b8', '#d06c34', '#8f8f8f', '#dea72f', '#3b64a7', '#639746', '#96b7db', '#Eca5bc', '#d06c34', '#8f8f8f', '#dea72f', '#3b64a7', '#639746', '#96b7db', '#Eca5bc'];
    const maxDeep = 12;
    const minDeep = 8;
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
    list.forEach(item => {
      const mesh = this.createSector(outerR, innerR, item.startAngle, item.endAngle, item.deep, item.color);
      this.scene.add(mesh)
    })
  }














  createSector(outRadius, innerRadius, startAngle, endAngle, depth, color) {
    const shape = new Shape();
    shape.moveTo(outRadius, 0);
    //shape.lineTo(0, this.innerRadius);
    shape.absarc(0, 0, innerRadius, 0, endAngle - startAngle, false);
    shape.absarc(0, 0, outRadius, endAngle - startAngle, 0, true);

    const extrudeSettings = {
      curveSegments: 60,//曲线分段数，数值越高曲线越平滑
      depth: depth,
      bevelEnabled: false,
      bevelSegments: 9,
      steps: 2,
      bevelSize: 0,
      bevelThickness: 0
    };

    // 创建扇形的几何体
    const geometry = new ExtrudeGeometry(shape, extrudeSettings);
    const material = new MeshBasicMaterial({ color: new Color(color), opacity: 0.9, transparent: true });
    const mesh = new Mesh(geometry, material);

    mesh.position.set(0, 0, 0);

    //mesh.data = data;

    mesh.rotateZ(startAngle);  // 旋转扇形以对齐其角度
    mesh.rotateZ(Math.PI / 2); // 旋转90度，使第一个扇形从下边的中点开始
    //保存当前扇形的中心角度
    //mesh.centerAngle = (startAngle + endAngle) / 2

    //添加边框
    const { border, topArcLine, bottomArcLine, innerArcLine } = this.createSectorBorder(outRadius, innerRadius, startAngle, endAngle, depth);
    mesh.add(border);
    mesh.add(topArcLine);
    mesh.add(bottomArcLine);
    mesh.add(innerArcLine);
    return mesh
  }




createSectorBorder(outRadius, innerRadius, startAngle, endAngle, depth, color = 0xffffff) {
  // 创建边框的材质
  const lineMaterial = new LineBasicMaterial({ color }); // 白色
  // 创建边框的几何体
  const borderGeometry = new BufferGeometry();
  borderGeometry.setFromPoints([
      new Vector3(innerRadius, 0, 0),
      new Vector3(outRadius, 0, 0),
      new Vector3(outRadius, 0, depth + 0.01),
      new Vector3(innerRadius, 0, depth),
      new Vector3(innerRadius, 0, 0)
  ]);
  // 创建边框的网格
  const border = new Line(borderGeometry, lineMaterial);
  // 创建顶部和底部的圆弧线
  const arcShape = new Shape();
  arcShape.absarc(0, 0, outRadius, endAngle - startAngle, 0, true);
  const arcPoints = arcShape.getPoints(50);
  const arcGeometry = new BufferGeometry().setFromPoints(arcPoints);
  const topArcLine = new Line(arcGeometry, lineMaterial);
  const bottomArcLine = new Line(arcGeometry, lineMaterial);
  bottomArcLine.position.z = depth; // 底部圆弧线的位置应该在扇形的底部
  //内圆弧线
  const innerArcShape = new Shape();
  innerArcShape.absarc(0, 0, innerRadius, endAngle - startAngle, 0, true);
  const innerArcPoints = innerArcShape.getPoints(50);
  const innerArcGeometry = new BufferGeometry().setFromPoints(innerArcPoints);
  const innerArcLine = new Line(innerArcGeometry, lineMaterial);
  innerArcLine.position.z = depth; // 底部圆弧线的位置应该在扇形的底部
  
  return { border, bottomArcLine, topArcLine, innerArcLine }
}
















  //注解：渲染函数
  public render() {
    requestAnimationFrame(this.render.bind(this))
    this.renderer.render(this.scene, this.camera);
    this.controls && this.controls.update();
    //注解：这个render主要是让地球内部的相关物体都运动起来
    this.earth && this.earth.render();
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