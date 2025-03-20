import { AmbientLight, AxesHelper, BufferAttribute, BufferGeometry, Color, DirectionalLight, ExtrudeGeometry, Group, Mesh, MeshPhongMaterial, OrthographicCamera, Points, PointsMaterial, Raycaster, Scene, ShaderMaterial, Shape, Sprite, SpriteMaterial, Texture, TextureLoader, Vector2, Vector3, WebGLRenderer } from "three";
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




  private uniforms: any = {
    iTime: { value: 0 },
    pointMap: {value: null}
  }

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
    //const axesHelper = new AxesHelper(200);
    //this.scene.add(axesHelper);
    
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



      this.createStars();

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











  createStars() {




    //const base64Texture = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABRCAYAAABFTSEIAAAACXBIWXMAAAsSAAALEgHS3X78AAAEp0lEQVR42u3cz4sjRRTA8W9Vd3Vn8mMmjj9WQWSRZQ+CsH+B7MnDIgiCd0E8CYJ/gOAIelo8ehUP/gF6WLw5/gMueFP2sIcF0dHd2Z1kknR11fOQZJJJMtlZd03H7HtQpNOTnpn+8Lrm1etmjIig8e/DKoECKqACKqCGAiqgAiqghgIqoAIqoIYCKqACKqCGAiqgAiqghgIqoAJudKTr+osZMNPvBUQBHwHsPF9fB9R0DeHMOQ6T6WOrhEzXBM4swDOL0M6CrArRVoq3t2dGUIb9fTvatg8ZZup1PDBgzPmy98mey6qfzjLz2WaWjEUZKEvGyi9nWyneMOvGIyFQo2Sbg4MUSChpU9IeTTUpJdsEajPZOJeJG5uBZj7rLLduWS5dGm6XNLEELOFUFj54ACJCaychkpDSASK3bwsXL0YgVpWJKwM0iy9Zy8HdGru7jvt3Pbu7w0wES7drTwAbjTHMGCsQcIAnYTC1/wRx0wEnl27JNgZI8HQ6Kc1mQq83RNzaMjPzXqDbjTQaJRFLxIyyMSxAXEkWrhrQzAAmo5HOjCQf7jflILxOkohL+aUPgV4vEGNJo+E5PAy02+UIMEwBxo0CPDP7Dg5SnEtpt1PA0e87XO25FOoh8IYIH2Y5b45RzGAQBiIltZoHxqMcjbksXAVgdc2EQMYzzzdotyeZWKuleULXJtwT4SODfC2QCWR+IF9KnjuX1Xbo99Op7LVE8iXlz0YBTk5SyLEEjo5OLuccEoFUvHfO+reuUPx4zftXAIcx1hdcF+/TvFab4A0Bs0VwqyhpVnkJT89/Q4DDQ0e77YCMwIUsFMeFZD856699URRvX4nxE4A/jbnxXp7v4Zw3ReGNSDHI8wFQjIafuoyn58L/fB6sth/Ybg9fez2TRC6QZcZYvgHsazF+MP7YCyLXcM7gvSXLDGBqYDg+NhwdmSpPoTrAkub0W+f4FSB1fDucIunMHSLpO8WAH0rSy8u+19MBCHB4OHzd2pI+CEUhpigEiN+l6WcdY252jLn5s7Wf472ImPcN8pUl/tEHoV4XWq1Ke4KrLmPsTA3oODpytFoOyJKSyzHyMSIxteWngMW5cSEdDJQUhTdZVgxOz3/+jFJm4+bA2e5JpNU6WZ4Fw99JwnWMKccwpeddP+B7GZTNUPKqybJy0O+Hs1YfMz9swwvpB8fbGDG0GuGkkK7V0hxSmZQpABI8l2z0v3sJf50qpAMJCd2qCulql3LD1lRGQjm7lEsDz0rkxTQOfiPPxUBcuJTbbhss/Y1eyi3NwsmKInmkZsKk5gtPUzNhvp11507CSy/X6XYStpvFudpZw1ZWIOF4Cq6SdtbKbioJyAhRTu3u9yMJXerN+ugvaQQsjcZ8Q3VnZwxlSDhe1lB9GjrSw5b+1avT8+Jw+979nNaOI6U3KpTrWAosxVQmygK4ld8X0ZtK/7eViExD7O1NQPb3T7fsl4/4sBpwYzPwjFbTo95Yl9l9Vd1YN1X/147HebSjary1AHyc5qc+XLQEQx9ve8Kg6xr6hKoCKqACKqCGAiqgAiqghgIqoAIqoIYCKqACKqCGAiqgAiqghgIq4JrHP8fEWV8FMTmOAAAAAElFTkSuQmCC'; // 省略部分数据




    this.uniforms.pointMap.value = this.resources.textures.gradient;

  //注解：保存顶点坐标，3个一组
  const vertices = [];
  //注解：往上面填充数据
  for (let i = 0; i < 20; i++) {
    //注解：范围是 -300 至 500
    const x = 600 * Math.random() -300;;
    const y = 600 * Math.random() -300;
    const z = 800 * Math.random() -400;
    vertices.push(new Vector3(x, y, z));
  }
  //注解：星空效果，首先需要创建一个缓冲几何体
  const around: BufferGeometry = new BufferGeometry();
  //注解：每3个数字构成一个缓冲几何体的一个顶点
  around.setFromPoints(vertices);

  const material = new ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: `
      varying vec2 vUv;
      uniform float iTime;
      void main(){
          vUv = vec2(uv.x,uv.y);
          vec3 u_position = position;

          //1. 当前的粒子位置在高度上的百分比 = (粒子高度 - 最低高度)/(最高高度 - 最低高度)
          float p1 = (u_position.z - (-400.0)) / (400.0 - (-400.0));



          //2. 下一帧的粒子位置在高度上的百分比 = 当前粒子高度百分比 - 时间 * 下落速度百分比
          // 此百分比不能超过1,所以使用fract只取小数部分
          float z = fract(p1 + iTime * 0.01) * 800.0 - 400.0;
          // 3.最终位置 = 下一帧的粒子高度百分比 * 总高度 - 最高高度
          // 我们的粒子总高度为100,最高的位置在50
          u_position.z = z;



          if(u_position.z <= 0.0){
            gl_PointSize = 0.0;
          
          }else{
            float p2 = z / 400.0;
            float size = 8.0 * sin((p2 + 0.1) * 3.1415926);
            

            gl_PointSize = size;




           
            float dx = 1.0;
            if(u_position.x < 0.0){
              dx = -1.0;
            }
            float dy = 1.0;
            if(u_position.y < 0.0){
             dy = -1.0;
            }




           


            u_position.x = u_position.x * p2;
            u_position.y = u_position.y * p2;

          }

          //u_position.x = 0.0;
          //u_position.y = 0.0;






          vec4 mvPosition = modelViewMatrix * vec4( u_position, 1.0 );

          

          
          gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D pointMap;
      void main(){
          vec2 gpc = gl_PointCoord;
          vec4 color = texture2D(pointMap,gpc);
          gl_FragColor = color;
      }
    `,
    transparent:true,
  })
  const points = new Points(around,material);
  this.scene.add(points);









 



    
  }





  

  //渲染函数
  public render() {
    requestAnimationFrame(this.render.bind(this))
    this.renderer.render(this.scene, this.camera);
    this.controls && this.controls.update();
    //让整个饼状图转动起来
    this.group.rotation.z += 0.01;

    this.uniforms.iTime.value += 0.2
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