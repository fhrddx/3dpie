import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Material, Mesh, MeshBasicMaterial,
  Object3D,
  Points, PointsMaterial, ShaderMaterial,
  SphereBufferGeometry, Sprite, SpriteMaterial, TextureLoader
} from "three";
import html2canvas from "html2canvas";
import earthVertex from '../../shaders/earth/vertex.vs';
import earthFragment from '../../shaders/earth/fragment.fs';
import { createAnimateLine, createLightPillar, createPointMesh, createWaveMesh, getCirclePoints, lon2xyz } from "../Utils/common";
import gsap from "gsap";
import { flyArc } from "../Utils/arc";
import { earthOptions, uniforms } from "../types";
import * as THREE from "three";

//注解：剩下2个问题：1、飞线的逻辑比较复杂，包括动画开始和结束怎么把控； 2、扫光动画，超级复杂，不好理解（顶点着色器、片元着色器）
export default class earth {
  //注解：这个是从构造函数获取
  private options: earthOptions;

  //注解：这会被直接加入scene，这个group包括 —— 星空、earthGroup，是最大的一个group
  public group: Group;
  //注解：这个group包括 —— 地球earth、地球遮罩层earth_border、地球辉光glow、markupPoint这个group、城市文本标注sprite_city、卫星轨道track（每个track还add了ball）、flyLineArcGroup
  private earthGroup: Group;
  //注解：这个group包括 —— 光座底部plane_circle、光柱plane_light_group、动态涟漪点wave
  private markupPoint: Group;
  //注解：飞线轨迹（通过userData加入动态飞线）
  private flyLineArcGroup: Group;

  //注解：支持点击的物体，通过userData['event_type'] 、sprite.userData['event_name'] 让点击时候取到这些数据
  public clickMesh: Object3D[];
  //注解：将所有的动态涟漪点位都加入进来，每个wave包含两个自定义属性 size（默认缩放大小） 、 scale（随机数0 ~ 1）
  private waveMeshArr: Object3D[];
  //注解：将所有的卫星轨迹都加入进来
  private circleLineList: any[];

  //注解：下面这两个是shader需要的相关变量
  private uniforms: uniforms
  private timeValue: number;

  //注释：大气层需要的传参
  private cloud_uniforms: any;

  //注解：地球是否自转
  private isRotation: boolean;
  //注解：光柱底座的材质
  private punctuationMaterial: MeshBasicMaterial;
  //注解：three.js 创建的地球
  private earth: Mesh<SphereBufferGeometry, ShaderMaterial>;

  constructor(options: earthOptions) {
    //注解：通过构造函数进来
    this.options = options;

    //注解：初始化最大的group
    this.group = new Group()
    this.group.name = "group";
    this.group.scale.set(0, 0, 0);
    //注解：初始化
    this.earthGroup = new Group();
    this.earthGroup.name = "EarthGroup";
    this.group.add(this.earthGroup);
    //注解：初始化标注点group
    this.markupPoint = new Group()
    this.markupPoint.name = "markupPoint";

    //注解：支持点击的物体
    this.clickMesh = [];
    //注解：涟漪点位
    this.waveMeshArr = [];
    //注解：卫星轨道
    this.circleLineList = []

    //注解：地球自转
    this.isRotation = this.options.earth.isRotation
    //注解：扫光动画shader
    this.timeValue = 100
    this.uniforms = {
      glowColor: {
        value: new Color(0x0cd1eb),
      },
      scale: {
        type: "f",
        value: -1.0,
      },
      bias: {
        type: "f",
        value: 1.0,
      },
      power: {
        type: "f",
        value: 3.3,
      },
      time: {
        type: "f",
        value: this.timeValue,
      },
      isHover: {
        value: false,
      },
      map: {
        value: null,
      },
    };

    //注释：大气层相关参数
    this.options.textures.flow.wrapS = THREE.RepeatWrapping;
    this.options.textures.flow.wrapT = THREE.RepeatWrapping;
    this.cloud_uniforms = {
      cloudTexture: {
        value: this.options.textures.flow
      },
      time: {
        value: 0.0
      },
    };
  }

  async init(): Promise<void> {
    return new Promise(async (resolve) => {
      //注解：创建地球
      this.createEarth();
      //注解：添加星星
      this.createStars();
      //注解：创建地球辉光
      this.createEarthGlow();
      //注解：创建蓝色静态光圈、创建光柱、创建涟漪点位
      await this.createMarkupPoint();
      //创建地球的大气层
      this.createEarthAperture();
      //注解：创建精灵文本标注
      await this.createSpriteLabel();
      //注解：创建环绕卫星
      this.createWeiXin();
      //创建飞线
      this.createFlyLine();
      //注解：开始显示出来
      this.show();
      resolve();
    })
  }

  //注解：开场时，蹦出来的动画效果
  show() {
    gsap.to(this.group.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: 2,
      ease: "Quadratic",
    })
  }

  //注解：创建2个球体，并都加入 earthGroup 中（存在问题：顶点着色器、片元着色器的代码还不是很了解）
  createEarth() {
    //注解：这里创建一个球体遮罩层，类似一个大气层
    const earth_border = new SphereBufferGeometry(
      this.options.earth.radius + 10,
      60,
      60
    );
    //注解：创建一个顶点材质
    const pointMaterial = new PointsMaterial({
      //注解：设置sizeAttenuation为true以启用近大远小效果‌
      sizeAttenuation: true,
      //定义材料是否使用顶点颜色，默认false，如果该选项设置为true，则color属性失效
      vertexColors: false,
      //注解：这里是设置顶点的颜色
      color: 0x81ffff,
      //注解：材质设置为透明，这样，颜色和其他物体会综合起来，更加逼真
      transparent: true,
      //注解：透明度，这个需要 transparent=true 才能生效
      opacity: 0.1,
      //注解：定义粒子的大小，默认为1.0， 而且这个形状通常都是正方形
      size: 0.01, 
    })
    //注解：将遮罩球体，添加到场景
    const earth_points = new Points(earth_border, pointMaterial);
    earth_points.name = 'earth_border';
    this.earthGroup.add(earth_points);

    //注解：SphereBufferGeometry表示创建一个球体，第1个参数是球体半径，第2个和第3个参数，越大表示球体越圆滑，这个才是真正的地球
    const earth_geometry = new SphereBufferGeometry(
      this.options.earth.radius,
      50,
      50
    );
    //注解：uniforms将数值传给片元着色器
    this.uniforms.map.value = this.options.textures.earth;
    //注解：自定义着色器材质，实现复杂的样式
    const earth_material = new ShaderMaterial({
      //注解：显示模型线条，这个如果是true，线条交错，会像鸟巢一样，而且是透明的
      //wireframe:true,
      uniforms: this.uniforms,
      //注解：这里用自定义的顶点着色器，里面的代码通过 varying 将数值传给片元着色器
      vertexShader: earthVertex,
      //注解：这里自定义片元着色器，通过 uniform 接收js的变量， 通过 varying 接收顶点着色器的变量
      fragmentShader: earthFragment,
    });
    //注解：设置 Shader 材质支持外部更新
    earth_material.needsUpdate = false;
    this.earth = new Mesh(earth_geometry, earth_material);
    this.earth.name = "earth";
    this.earthGroup.add(this.earth);
  }

  //注解：创建星空效果（需要注意的是，每个星星颜色、形状可否改变），由不规则几何体的顶点构成星空，并加入到 group 中
  createStars() {
    //注解：保存顶点坐标，3个一组
    const vertices = [];
    //注释：这个颜色坐标，其实并没有什么作用
    const colors = [];
    //注解：往上面填充数据
    for (let i = 0; i < 500; i++) {
      //注解：范围是 -300 至 500
      const x = 800 * Math.random() - 300;
      const y = 800 * Math.random() - 300;
      const z = 800 * Math.random() - 300;
      vertices.push(x, y, z);
      colors.push(new Color(1, 1, 1));
    }

    //注解：星空效果，首先需要创建一个缓冲几何体
    const around: BufferGeometry = new BufferGeometry();
    //注解：每3个数字构成一个缓冲几何体的一个顶点
    around.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
    //注解：这里设置了颜色，其实是没有效果的，需要测验一下
    around.setAttribute("color", new BufferAttribute(new Float32Array(colors), 1));

    //注解：创建缓冲几何体的材质，这里应该是顶点材质，也就是 PointsMaterial
    const aroundMaterial = new PointsMaterial({
      //注解：每个顶点的大小
      size: 2,
      //注解：true 表示看到的效果是近大远小
      sizeAttenuation: true,
      //注解：每个顶点的颜色
      color: 0x4d76cf,
      //注解：这个要设置为透明的，否则形状会变成正方形
      transparent: true,
      opacity: 1,
      //注解：需要设置为纹理（纹理是圆形，圆外是透明的），否则会变成正方形
      map: this.options.textures.gradient,
    });

    const aroundPoints : Points<BufferGeometry, PointsMaterial> = new Points(around, aroundMaterial);
     aroundPoints.name = "stars";
    //注解：这个可以设置缓冲几何体的缩放大小，默认就是1,1,1的缩放，所以这句代码写了其实也没用
    aroundPoints.scale.set(1, 1, 1);
    this.group.add(aroundPoints);
  }

  //注解：通过创建精灵物体，来给地球加上发光效果，并加入 earthGroup 中 
  createEarthGlow() {
    //注解：地球半径
    const R = this.options.earth.radius; 
    //注解：TextureLoader创建一个纹理加载器对象，可以加载图片作为纹理贴图
    const texture = this.options.textures.glow;
    //注解：创建精灵材质对象SpriteMaterial，为什么是精灵材质，因为这个背景图始终要面向用户，所以要创建精灵，精灵就要选用精灵材质
    const spriteMaterial = new SpriteMaterial({
      //注解：设置精灵纹理贴图
      map: texture, 
      color: 0x4390d1,
      //注解：开启透明，如果是false，将是一个正方形，遮挡后面景观
      transparent: true, 
      //注解：可以通过透明度整体调节光圈，就是可以控制发光亮度
      opacity: 0.7,
      //禁止写入深度缓冲区数据
      depthWrite: false, 
    });
    //注解：创建表示地球光圈的精灵模型
    const sprite = new Sprite(spriteMaterial);
    sprite.name = 'glow';
    //注解：适当缩放精灵
    sprite.scale.set(R * 3.0, R * 3.0, 1);
    //注解：将精灵加到 earthGroup
    this.earthGroup.add(sprite);
  }

  //注解：创建蓝色光圈贴近球面、光柱垂直球面、涟漪点位贴近球面
  async createMarkupPoint() {
    await Promise.all(this.options.data.map(async (item) => {
      //注解：每个Item 结构是 { startArray: { name: '', N: '', E: '' },  endArray: [ { name: '', N: '', E: '' }, { name: '', N: '', E: '' } ] }
      const radius = this.options.earth.radius;
      //注解：经度
      const lon = item.startArray.E;
      //注解：纬度
      const lat = item.startArray.N; 

      //注解：涟漪点的材质，注意这个材质是要去创建一个平面，并在球体上贴上这个平面
      this.punctuationMaterial = new MeshBasicMaterial({
        //注解：涟漪点位的颜色
        color: this.options.punctuation.circleColor,
        //注解：涟漪点位的贴图（这个贴图是透明的）
        map: this.options.textures.label,
        //注解：使用背景透明的png贴图，注意开启透明设置
        transparent: true,
        //注解：禁止写入深度缓冲区数据
        depthWrite: false,
      });

      //注解：光柱底座矩形平面，并加入标记组 markupPoint 中，注意这个是静态的蓝色波纹，对应的贴图是label
      const mesh = createPointMesh({ radius, lon, lat, material: this.punctuationMaterial });
      mesh.name = 'plane_circle';
      this.markupPoint.add(mesh);
      
      //注解：创建光柱，并加入标记组 markupPoint 中
      const LightPillar = createLightPillar({
        radius: this.options.earth.radius,
        lon,
        lat,
        index: 0,
        textures: this.options.textures,
        punctuation: this.options.punctuation,
      });
      LightPillar.name = 'plane_light_group';
      this.markupPoint.add(LightPillar);

      //注解：创建涟漪点位，并加入标记组 markupPoint 中，注意这个最后是动态的效果
      const WaveMesh = createWaveMesh({ radius, lon, lat, textures: this.options.textures });
      WaveMesh.name = 'wave';
      this.markupPoint.add(WaveMesh);
      this.waveMeshArr.push(WaveMesh);

      //注解：处理每个目的地数据，obj 是目的地
      await Promise.all(item.endArray.map((obj) => {
        //注解：经度
        const lon = obj.E;
        //注解：纬度
        const lat = obj.N;
        
        //注解：每个目的地，生成一个平面并贴近球面，贴图是蓝色的静态波纹，并加入 markupPoint 组中
        const mesh = createPointMesh({ radius, lon, lat, material: this.punctuationMaterial });
        mesh.name = 'plane_circle';
        this.markupPoint.add(mesh);

        //注解：为每一个目的地，生成一个光柱，并加入 markupPoint 组中
        const LightPillar = createLightPillar({
          radius: this.options.earth.radius,
          lon,
          lat,
          index: 1,
          textures: this.options.textures,
          punctuation: this.options.punctuation
        });
        LightPillar.name = 'plane_light_group';
        this.markupPoint.add(LightPillar);

        //注解：为每一个目的地，创建一个涟漪点位，注意这个最后是动态的光圈，并加入 markupPoint 组中
        const WaveMesh = createWaveMesh({ radius, lon, lat, textures: this.options.textures });
        this.markupPoint.add(WaveMesh);
        this.waveMeshArr.push(WaveMesh);
      }))

      //注解：最后将标记组 markupPoint 加入到地球组 earthGroup
      this.earthGroup.add(this.markupPoint);
    }))
  }

  createEarthAperture() {
    //顶点着色器
    const VSHADER_SOURCE = 
    `
      varying vec2 v_Uv;
      void main () {
        //顶点纹理坐标
        v_Uv = uv;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `;
    //片元着色器
    const FSHADER_SOURCE = 
    `
      uniform float time; //时间变量
      uniform sampler2D cloudTexture; //大气纹理图像
      varying vec2 v_Uv; //片元纹理坐标
      void main () {
        vec2 new_Uv= v_Uv + vec2(0.01, 0.02) * time;   //向量加法，根据时间变量计算新的纹理坐标
        //利用噪声随机使纹理坐标随机化
        //vec4 noise_Color = texture2D( cloudTexture, new_Uv );    
        //new_Uv.x += noise_Color.r * 0.2;
        //new_Uv.y += noise_Color.g * 0.2;
        vec4 colors = texture2D(cloudTexture, new_Uv);  //提取大气纹理图像的颜色值（纹素）
        gl_FragColor = vec4(colors.rgb, colors.a * 0.6);
      }
    `
    //着色器材质
    const flowMaterial = new THREE.ShaderMaterial({
      uniforms: this.cloud_uniforms,
      //顶点着色器
      vertexShader: VSHADER_SOURCE,
      //片元着色器
      fragmentShader: FSHADER_SOURCE,
      transparent: true
    })
    //创建比基础球体略大的球状几何体
    const fgeometry = new THREE.SphereGeometry(this.options.earth.radius * 1.002, 60, 60);
    //创建大气球体
    const fsphere = new THREE.Mesh(fgeometry, flowMaterial);
    this.group.add(fsphere)
  }

  //注解：创建精灵文本标注
  async createSpriteLabel() {
    //注解：每个Item 结构是 { startArray: { name: '', N: '', E: '' },  endArray: [ { name: '', N: '', E: '' }, { name: '', N: '', E: '' } ] }
    await Promise.all(this.options.data.map(async item => {
      //注解：将出发地和目的地全部存起来
      let cityArry = [];
      cityArry.push(item.startArray);
      cityArry = cityArry.concat(...item.endArray);

      await Promise.all(cityArry.map(async e => {
        //注解：每个e 数据结构是 { name: '', N: '', E: '' }
        const p = lon2xyz(this.options.earth.radius * 1.001, e.E, e.N);

        //注解：根据城市名称，生成html
        const div = `<div class="fire-div">${e.name}</div>`;
        const shareContent = document.getElementById("html2canvas");
        shareContent.innerHTML = div;

        //注解：将以上的 html 转化为 canvas，再将 canvas 转化为贴图
        const opts = {
          //注解：这样表示背景透明
          backgroundColor: null,
          scale: 6,
          dpi: window.devicePixelRatio,
        };
        const canvas = await html2canvas(document.getElementById("html2canvas"), opts)
        const dataURL = canvas.toDataURL("image/png");
        const map = new TextureLoader().load(dataURL);

        //注解：根据精灵材质，生成精灵，为什么选用精灵？因为精灵的特点就是，始终面向用户
        const material = new SpriteMaterial({
          map: map,
          transparent: true,
        });
        const sprite = new Sprite(material);

        //注解：这里的缩放，是根据一个单位来计算的，精灵是二维的，所以第三个无论怎么设置，都是不会变动的, 所以干脆设置为1
        const len = 5 + (e.name.length - 2) * 2;
        sprite.scale.set(len, 3, 1);

        //注解：精灵图片悬空，很好理解，将精灵加入到 eath 这个物体上，而没有加入 eathgroup 中, 其实好像都是一样的
        sprite.position.set(p.x * 1.1, p.y * 1.1, p.z * 1.1);
        sprite.name = 'sprite_city';
        this.earth.add(sprite);

        //将这个精灵存放起来
        sprite.userData['event_type'] = 'sprite';
        sprite.userData['event_name'] = e.name;

        this.clickMesh.push(sprite);
      }))
    }))
  }

  //注解：在地球上面添加飞线
  createFlyLine() {
    //注解：设置飞线管道贴图的重复方向
    this.options.textures.flyline.wrapT =  THREE.RepeatWrapping;
    this.options.textures.flyline.wrapS = THREE.RepeatWrapping;
    this.options.textures.flyline.repeat.set(1, 2);
    //注解：创建飞线组合，加入地球组合中
    this.flyLineArcGroup = new Group();
    this.flyLineArcGroup.userData['flyLineArray'] = [];
    this.earthGroup.add(this.flyLineArcGroup);
    this.options.data.forEach((cities) => {
      cities.endArray.forEach(item => {
        //注解：调用函数flyArc绘制球面上任意两点之间飞线圆弧轨迹
        const arcline = flyArc(
          this.options.earth.radius,
          cities.startArray.E,
          cities.startArray.N,
          item.E,
          item.N,
          this.options.flyLine.color,
          this.options.flyLine.flyLineColor,
          this.options.textures.flyline
        );
        //注解：飞线插入flyArcGroup中
        this.flyLineArcGroup.add(arcline);
        this.flyLineArcGroup.userData['flyLineArray'].push(arcline.userData['flyLine']);
      });
    })
  }

  //创建卫星轨道
  createWeiXin(){
    //注解：设置卫星轨道的重复方向
    this.options.textures.weixincircle.wrapT =  THREE.RepeatWrapping;
    this.options.textures.weixincircle.wrapS = THREE.RepeatWrapping;
    this.options.textures.weixincircle.repeat.set(1, 2);

    //注解：创建圆环点组合（这个这些点，都是在 ZOX 平面上）
    const circlePoints = getCirclePoints({
      //注解：圆的半径
      radius: this.options.earth.radius * 1.25,
      //注解：圆的切割数量
      number: 100,
      //注解：表示闭合
      closed: true,
    });

    //注解：圆环材质
    const circleMaterial = new MeshBasicMaterial({
      color: new Color("#0cd1eb"),
      map: this.options.textures.weixincircle,
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
      opacity: 0.2,
    });

    //注解：创建一个管道模型，来实现卫星轨道，并加入到 earthGroup 中（注意第一条卫星轨迹，是放在ZOX平面上的）
    const line = createAnimateLine({
      pointList: circlePoints,
      material: circleMaterial,
      number: 150,
      radius: 1,
      radialSegments: 2
    });
    line.name = 'track_weixin';
    this.earthGroup.add(line);
    //注解：可以通过以下方式让卫星轨道倾斜一定的角度
    //line.rotation.z = -Math.PI / 9;

    //注解：创建卫星球体2个
    const ball = new Mesh(
      new SphereBufferGeometry(this.options.satellite.size, 32, 32),
      new MeshBasicMaterial({
        color: "#e0b187",
      })
    );
    const ball2 = ball.clone();
    ball.position.set(
      circlePoints[0][0],
      0,
      circlePoints[0][2]
    );
    ball2.position.set(
      circlePoints[Math.floor(circlePoints.length/2)][0],
      0,
      circlePoints[Math.floor(circlePoints.length/2)][2]
    );
    line.add(ball);
    line.add(ball2);
    this.circleLineList.push(line);
  }

  render() {
    //注解：整个球体自西往东旋转 0.002 方向是：自西向东
    if (this.isRotation) {
      this.earthGroup.rotation.y += this.options.earth.rotateSpeed;
    }
    //注解：整个球体自东往西旋转 -0.01 会比地球旋转要快一点，方向是：自东向西（负数）
    this.circleLineList.forEach((e) => {
      e.rotateY(this.options.satellite.rotateSpeed);
    });
    //注解：通过不断改变这个缩放，让波纹动起来 mesh.scale.set 、 mesh.material.opacity 来改变物体的大小和材质
    if (this.waveMeshArr.length) {
      this.waveMeshArr.forEach((mesh: Mesh) => {
        mesh.userData['scale'] += 0.007;
        mesh.scale.set(
          mesh.userData['size'] * mesh.userData['scale'],
          mesh.userData['size'] * mesh.userData['scale'],
          mesh.userData['size'] * mesh.userData['scale']
        );
        if (mesh.userData['scale'] <= 1.5) {
          (mesh.material as Material).opacity = (mesh.userData['scale'] - 1) * 2; //2等于1/(1.5-1.0)，保证透明度在0~1之间变化
        } else if (mesh.userData['scale'] > 1.5 && mesh.userData['scale'] <= 2) {
          (mesh.material as Material).opacity = 1 - (mesh.userData['scale'] - 1.5) * 2; //2等于1/(2.0-1.5) mesh缩放2倍对应0 缩放1.5被对应1
        } else {
          mesh.userData['scale'] = 1;
        }
      });
    }

    //注解：飞线运动起来
    this.flyLineArcGroup?.userData['flyLineArray']?.forEach(fly => {
      //注解：飞线速度
      fly.rotation.z += this.options.flyLine.speed;
      if (fly.rotation.z >= fly.flyEndAngle) fly.rotation.z = 0;
    })

    //注解：扫光动画加入时间参数
    this.uniforms.time.value = this.uniforms.time.value < -this.timeValue ? this.timeValue : this.uniforms.time.value - 1;
    this.cloud_uniforms.time.value += 0.02
  }
}