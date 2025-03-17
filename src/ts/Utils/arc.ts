// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { 
  ArcCurve, BufferGeometry,
  Line, LineBasicMaterial, MeshBasicMaterial,DoubleSide,Quaternion, Vector3 
} from 'three';
import { lon2xyz } from './common';
import { createAnimateLine } from "../Utils/common";

//注解：计算A、B两点和顶点O构成的AOB夹角弧度值
function radianAOB(A, B, O) {
  // dir1、dir2：球面上两个点和球心构成的方向向量
  const dir1 = A.clone().sub(O).normalize();
  const dir2 = B.clone().sub(O).normalize();
  //点乘.dot()计算夹角余弦值
  const cosAngle = dir1.clone().dot(dir2);
  //余弦值转夹角弧度值,通过余弦值可以计算夹角范围是0~180度
  const radianAngle = Math.acos(cosAngle);
  return radianAngle
}

/*
注解：绘制一条圆弧曲线模型Line
5个参数含义：(圆心横坐标, 圆心纵坐标, 飞线圆弧轨迹半径, 开始角度, 结束角度)
*/
function circleLine(x, y, r, startAngle, endAngle, color) {
  //注解：创建一个缓冲几何体
  const geometry = new BufferGeometry();
  //注解：ArcCurve创建圆弧曲线，注意：弧度0表示x轴正方向，弧度 pi/2 表示Y轴正方向，是逆时针方向转动的
  const arc = new ArcCurve(x, y, r, startAngle, endAngle, false);
  //注解：getSpacedPoints是基类Curve的方法，返回一个vector2对象作为元素组成的数组，分割80份，一共81个点
  const points = arc.getSpacedPoints(80);
  //注解：设置缓冲几何体的顶点，使之成为一个固定的几何体
  geometry.setFromPoints(points);
  //注解：线条材质
  const material = new LineBasicMaterial({
    color: color || 0xd18547,
    opacity: 0.6,
    transparent: true
  });
  const line = new Line(geometry, material);
  return line;
}

/*
注解：逻辑有点复杂
* 把3D球面上任意的两个飞线起点和结束点绕球心旋转到到XOY平面上，
* 同时保持关于y轴对称，借助旋转得到的新起点和新结束点绘制
* 一个圆弧，最后把绘制的圆弧反向旋转到原来的起点和结束点即可
*/
function _3Dto2D(startSphere, endSphere) {
  const origin = new Vector3(0, 0, 0);
  //注解：飞线起点与球心构成方向向量，方向是球心指向开始地点
  const startDir = startSphere.clone().sub(origin);
  //注解：飞线结束点与球心构成方向向量。方向是球心指向结束地点
  const endDir = endSphere.clone().sub(origin); 

  //注解：cross 将会生成一个法向量，垂直于上面2个向量，并且指向遵守右手法则，这里通过 normalize 将这个法向量长度变成1
  const normal = startDir.clone().cross(endDir).normalize();
  //注解：XOY平面的法向量
  const xoyNormal = new Vector3(0, 0, 1);
  //注解：这里需要旋转平面，将平面旋转到XOY平面上，那么通过前后两个平面的法向量来生成四元数即可
  const quaternion3D_XOY = new Quaternion().setFromUnitVectors(normal, xoyNormal);
  //注解：第一次旋转：飞线起点、结束点从3D空间第一次旋转到XOY平面
  const startSphereXOY = startSphere.clone().applyQuaternion(quaternion3D_XOY);
  const endSphereXOY = endSphere.clone().applyQuaternion(quaternion3D_XOY);

  /*计算第二次旋转的四元数*/
  //注解：获取这两个点的中点，那么圆心和这个中点的连线必定垂直于开始点和结束点的连线
  const middleV3 = startSphereXOY.clone().add(endSphereXOY).multiplyScalar(0.5);
  //注解：圆心与这个重点的连线，必定垂直于开始点和结束点的连线，这里取法向量
  const midDir = middleV3.clone().sub(origin).normalize();
  //注解：这里表示将旋转到Y轴的正方向，注意这里取单位向量
  const yDir = new Vector3(0, 1, 0);

  //注解：这里旋转为以Y轴为对称的坐标，需要生成第二个四元数
  const quaternionXOY_Y = new Quaternion().setFromUnitVectors(midDir, yDir);
  //第二次旋转：使旋转到XOY平面的点再次旋转，实现关于Y轴对称
  const startSpherXOY_Y = startSphereXOY.clone().applyQuaternion(quaternionXOY_Y);
  const endSphereXOY_Y = endSphereXOY.clone().applyQuaternion(quaternionXOY_Y);

  /**一个四元数表示一个旋转过程
   *.invert()方法表示四元数的逆，简单说就是把旋转过程倒过来
   * 两次旋转的四元数执行.invert()求逆，然后执行.multiply()相乘
   *新版本.invert()对应旧版本.invert()
   */
  const quaternionInverse = quaternion3D_XOY.clone().invert().multiply(quaternionXOY_Y.clone().invert());
  return {
    //返回两次旋转四元数的逆四元数
    quaternion: quaternionInverse,
    //范围两次旋转后在XOY平面上关于y轴对称的圆弧起点和结束点坐标
    startPoint: startSpherXOY_Y,
    endPoint: endSphereXOY_Y,
  }
}

//注解：求三个点的外接圆圆心，p1, p2, p3表示三个点的坐标Vector3 （这个纯粹是数学推导公式，网上都有，可以查下）
function threePointCenter(p1, p2, p3) {
  const L1 = p1.lengthSq();
  const L2 = p2.lengthSq();
  const L3 = p3.lengthSq();
  const x1 = p1.x,
    y1 = p1.y,
    x2 = p2.x,
    y2 = p2.y,
    x3 = p3.x,
    y3 = p3.y;
  const S = x1 * y2 + x2 * y3 + x3 * y1 - x1 * y3 - x2 * y1 - x3 * y2;
  const x = (L2 * y3 + L1 * y2 + L3 * y1 - L2 * y1 - L3 * y2 - L1 * y3) / S / 2;
  const y = (L3 * x2 + L2 * x1 + L1 * x3 - L1 * x2 - L2 * x3 - L3 * x1) / S / 2;
  //三点外接圆圆心坐标
  const center = new Vector3(x, y, 0);
  return center;
}

/**
 * 注解：转变2次坐标，然后再转回来
 * 输入地球上任意两点的经纬度坐标，通过函数flyArc可以绘制一个飞线圆弧轨迹
 * lon1,lat1:轨迹线起点经纬度坐标
 * lon2,lat2：轨迹线结束点经纬度坐标
 */
function flyArc(radius, lon1, lat1, lon2, lat2, lineColor, flyLineColor, flyLineTexture) {
  //注解：将开始地点，经纬度坐标转为球面坐标
  const sphereCoord1 = lon2xyz(radius, lon1, lat1);
  const startSphereCoord = new Vector3(sphereCoord1.x, sphereCoord1.y, sphereCoord1.z);
  //注解：将结束地点，经纬度坐标转为球面坐标
  const sphereCoord2 = lon2xyz(radius, lon2, lat2);
  const endSphereCoord = new Vector3(sphereCoord2.x, sphereCoord2.y, sphereCoord2.z);
  //注解：计算绘制圆弧需要的关于y轴对称的起点、结束点和旋转四元数
  const startEndQua = _3Dto2D(startSphereCoord, endSphereCoord)
  // 调用arcXOY函数绘制一条圆弧飞线轨迹
  const arcline = arcXOY(radius, startEndQua.startPoint, startEndQua.endPoint,lineColor, flyLineColor, flyLineTexture);
  arcline.quaternion.multiply(startEndQua.quaternion)
  return arcline;
}

/*
 注解：飞线段运动范围startAngle ~ flyEndAngle
 通过函数arcXOY()可以在XOY平面上绘制一个关于y轴对称的圆弧曲线
 * startPoint, endPoint：表示圆弧曲线的起点和结束点坐标值，起点和结束点关于y轴对称
 * 同时在圆弧轨迹的基础上绘制一段飞线*/
 function arcXOY(radius, startPoint, endPoint, lineColor, flyLineColor, flyLineTexture) {
  //注解：计算弦的中点
  const middleV3 = new Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);
  //注解：计算弦的中点与圆心的向量，并且归一化
  const dir = middleV3.clone().normalize();
  //注解：这条弦对应的圆心角
  const earthRadianAngle = radianAOB(startPoint, endPoint, new Vector3(0, 0, 0));

  //注解：这里是给定地球上的飞线与地面距离的最高点（地球半径+飞线弧长的0.2倍，也可以给出其他高度，因为这个高度也不是很好看）
  /*设置飞线轨迹圆弧的中间点坐标
  弧度值 * radius * 0.2：表示飞线轨迹圆弧顶部距离地球球面的距离
  起点、结束点相聚越远，构成的弧线顶部距离球面越高*/
  const r = radius + earthRadianAngle * radius * 0.2;
  const limitR = radius * 1.15;
  const arcTopCoord = dir.multiplyScalar( r > limitR ? limitR : r);

  //注解：这里是根据圆上的三个点，计算出圆心的位置，这里其实是可以根据数学知识推导出来的。这个圆心也就是飞线所在圆的圆心。
  const flyArcCenter = threePointCenter(startPoint, endPoint, arcTopCoord);
  //注解：计算出飞线的半径
  const flyArcR = Math.abs(flyArcCenter.y - arcTopCoord.y);

  /*坐标原点和飞线起点构成直线和y轴负半轴夹角弧度值
  参数分别是：飞线圆弧起点、y轴负半轴上一点、飞线圆弧圆心*/
  const flyRadianAngle = radianAOB(startPoint, new Vector3(0, -1, 0), flyArcCenter);
  //注解：飞线圆弧开始角度
  const startAngle = -Math.PI / 2 + flyRadianAngle;
  //注解：飞线圆弧结束角度
  const endAngle = Math.PI - startAngle;
  //注解：调用圆弧线模型的绘制函数，画出圆弧的轨迹
  const arcline = circleLine(flyArcCenter.x, flyArcCenter.y, flyArcR, startAngle, endAngle, lineColor);

  //注解：给自定义属性center，表示飞线圆弧的圆心
  arcline.center = flyArcCenter;
  //注解：给自定义属性topCoord，表示飞线圆弧的最高点
  arcline.topCoord = arcTopCoord;

  //注解：设定动态弧线的长度，为总轨迹长度的七分之一
  const flyAngle = (endAngle - startAngle) / 4;
  //注解：画出动态飞线的轨迹（注意这里是以原点为圆心，所以需要手动设置下Y轴位置）
  const flyLine = createFlyLine(flyArcR, startAngle, startAngle + flyAngle, flyLineColor, flyLineTexture);
  //注解：平移飞线圆弧和飞线轨迹圆弧重合
  flyLine.position.y = flyArcCenter.y;
  //注解：飞线段flyLine作为飞线轨迹arcLine子对象，继承飞线轨迹平移旋转等变换
  arcline.add(flyLine);

  //飞线段运动范围 startAngle ~ flyEndAngle (flyEndAngle、startAngle、AngleZ 都是自定义属性)
  flyLine.flyEndAngle = endAngle - startAngle - flyAngle;
  flyLine.startAngle = startAngle;
  // arcline.flyEndAngle：飞线段当前角度位置，这里设置了一个随机值用于演示
  flyLine.AngleZ = arcline.flyEndAngle * Math.random();

  // flyLine.rotation.z = arcline.AngleZ;
  // arcline.flyLine指向飞线段,便于设置动画是访问飞线段
  arcline.userData['flyLine'] = flyLine;
  return arcline;
}

























function createFlyLine(radius, startAngle, endAngle, color, flyLineTexture) {
    const arc = new ArcCurve(0, 0, radius, startAngle, endAngle, false);
    const pointsArr = arc.getSpacedPoints(80);
    const circlePointsArr = [];
    pointsArr.forEach(e => {
      circlePointsArr.push([e.x, e.y, 0]);
    })

    //console.log(pointsArr)





    //注解：圆环材质
    const circleMaterial = new MeshBasicMaterial({
      color: color,
      map: flyLineTexture,
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
      opacity: 1,
    });



    //注解：创建一个管道模型，来实现卫星轨道，并加入到 earthGroup 中（注意第一条卫星轨迹，是放在ZOX平面上的）
    const line = createAnimateLine({
      pointList: circlePointsArr,
      material: circleMaterial,
      number: 150,
      radius: 0.2,
      radialSegments: 2
    });

    return line;


  

    /*






  //------------------------------------------------------------------------------------------------------------
  //注解：声明一个几何体对象BufferGeometry
  const geometry = new BufferGeometry();
  //注解：ArcCurve创建圆弧曲线（注意这里是以原点为圆心）
  const arc = new ArcCurve(0, 0, radius, startAngle, endAngle, false);
  //注解：getSpacedPoints是基类Curve的方法，返回一个vector2对象作为元素组成的数组，分段数80，返回81个顶点
  const pointsArr = arc.getSpacedPoints(80);   //---------------------------------------------------------------
  //注解：设置这个缓冲几何体的顶点
  geometry.setFromPoints(pointsArr);

  //注解：每个顶点对应一个百分比数据 attributes.percent 用于控制点的渲染大小, 这样飞线的头部，点的尺寸比较大，飞线的尾部，点的尺寸比较小
  const percentArr = [];
  for (let i = 0; i < pointsArr.length; i++) {
    percentArr.push(i / pointsArr.length);
  }
  const percentAttribue = new BufferAttribute(
    new Float32Array(percentArr),
    1
  );
  geometry.attributes.percent = percentAttribue;

  //注解：批量计算所有顶点颜色数据（注意，这段代码实际上没有起作用，因为顶点着色器，片元着色器都没有用到这个变量）
  const colorArr = [];
  for (let i = 0; i < pointsArr.length; i++) {
    const color1 = new Color(0xec8f43); //轨迹线颜色 青色
    const color2 = new Color(0xf3ae76); //黄色
    const color = color1.lerp(color2, i / pointsArr.length);
    colorArr.push(color.r, color.g, color.b);
  }
  //注解：设置几何体顶点颜色数据
  geometry.attributes.color = new BufferAttribute(
    new Float32Array(colorArr),
    3
  );

  //点模型渲染几何体每个顶点
  const material = new PointsMaterial({
    color: color,
    size: 1.3, //点大小
    // vertexColors: VertexColors, //使用顶点颜色渲染
    transparent: true,
    depthWrite: false,
  });
  // 修改点材质的着色器源码(注意：不同版本细节可能会稍微会有区别，不过整体思路是一样的)
  material.onBeforeCompile = function (shader) {
    // 顶点着色器中声明一个attribute变量:百分比
    shader.vertexShader = shader.vertexShader.replace(
      "void main() {",
      [
        "attribute float percent;", //顶点大小百分比变量，控制点渲染大小
        "void main() {",
      ].join("\n") // .join()把数组元素合成字符串
    );
    // 调整点渲染大小计算方式
    shader.vertexShader = shader.vertexShader.replace(
      "gl_PointSize = size;",
      ["gl_PointSize = percent * size;"].join("\n") // .join()把数组元素合成字符串
    );
  };
  const FlyLine = new Points(geometry, material);
  FlyLine.name = "飞行线";
  return FlyLine;

  */
}











export {
  arcXOY,
  flyArc
}
