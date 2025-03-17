import { CatmullRomCurve3, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneBufferGeometry, Texture, TubeGeometry, Vector3 } from "three";
import punctuation from "../types";

//注解：光柱底座矩形平面
export const createPointMesh = (options: {
  radius: number, 
  lon: number,
  lat: number, 
  material: MeshBasicMaterial
}) => {
  //注解：创建一个平面几何体，这个几何体长和宽都是1，大小先不纠结，因为后面通过 scale 可以缩放，注意这个平面默认在三维空间的 XOY 平面上
  const geometry = new PlaneBufferGeometry(1, 1);
  //注解：通过传过来的平面材质，生成物体 mesh ，并且通过 scale 缩放这个平面的大小
  const mesh = new Mesh(geometry, options.material);
  const size = options.radius * 0.05;
  mesh.scale.set(size, size, size);
  //注解：经纬度转球面坐标,并设置这个平面的位置（注意这个1.0015，主要还是比地球稍微高出一点）
  const coord = lon2xyz(options.radius * 1.0021, options.lon, options.lat);
  mesh.position.set(coord.x, coord.y, coord.z);
  //注解：将这个向量，转化为长度为1，方向不变的变量（这个其实就是这个平面的单位法向量）
  const coordVec3 = new Vector3(coord.x, coord.y, coord.z).normalize();
  //注解：这个是z轴正方向，长度为1的向量
  const meshNormal = new Vector3(0, 0, 1);
  //注解：将这个平面进行旋转，使之贴近球面，怎么旋转？ 首先我们创建的平面，默认是垂直于z轴的，所以需要从（0,0,1）旋转到平面位置对应的法向量，也就是 coordVec3 代表的向量
  mesh.quaternion.setFromUnitVectors(meshNormal, coordVec3);
  return mesh;
}

//注解：创建柱状，需要注意的是，translate 之后如果还设置组合的位置，那这个组合的中心点为 translate 之前的那个中心点
export const createLightPillar = (options: { radius: number, lon: number, lat: number, index: number, textures: Record<string, Texture>, punctuation: punctuation }) => {
  //注解：这里是设置光柱的高度
  const height = options.radius * 0.3;
  //注解：这里是创建一个平面，默认是垂直于z轴的，经过旋转
  const geometry = new PlaneBufferGeometry(options.radius * 0.05, height);
  //注解：经过旋转，这个平面与 ZOX 平面平行
  geometry.rotateX(Math.PI / 2);
  //注解：经过转移Z轴，使得这个平面全部都在Z轴的正方向
  geometry.translate(0, 0, height/2);
  //注解：将这个平面和材质生成一个物体
  const material = new MeshBasicMaterial({
    map: options.textures.light_column,
    color:
      options.index == 0
        ? options.punctuation.lightColumn.startColor
        : options.punctuation.lightColumn.endColor,
    transparent: true,
    side: DoubleSide,
    //是否对深度缓冲区有任何的影响
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);

  //注解：生成一个物体组合
  const group = new Group();
  //注解：这里是两个光柱十字交叉，也就是两个平面互相垂直，互相在中心点交叉
  group.add(mesh, mesh.clone().rotateZ(Math.PI / 2));

  //注解：将经纬度坐标转化为球面坐标，然后将这个组合设置在这个坐标上面（这时候还没完，因为这个组合没有垂直于球体）
  const SphereCoord = lon2xyz(options.radius * 1.0023, options.lon, options.lat);
  group.position.set(SphereCoord.x, SphereCoord.y, SphereCoord.z);

  //注解：将位置向量变成程度为1的同方向的向量
  const coordVec3 = new Vector3(
    SphereCoord.x,
    SphereCoord.y,
    SphereCoord.z
  ).normalize();
  const meshNormal = new Vector3(0, 0, 1);
  //按这个向量的位置旋转，使得上面的组合体能都垂直于地球表面
  group.quaternion.setFromUnitVectors(meshNormal, coordVec3);
  return group;
}

//注解：创建波动光圈 存在问题是：size 和 scale 这两个自定属性后续有什么具体作用
export const createWaveMesh = (options: { radius, lon, lat, textures }) => {
  //注解：创建一个平面，默认在XOY平面上，这里之所以是1，就是为了能多次执行 scale.set 不会叠加上次的缩放
  const geometry = new PlaneBufferGeometry(1, 1);
  const material = new MeshBasicMaterial({
    color: 0xe99f68,
    map: options.textures.aperture,
    //注解：使用背景透明的png贴图，注意开启透明计算
    transparent: true,
    opacity: 1.0,
    //注解：禁止写入深度缓冲区数据
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);

  //注解：设置一下这个平面的大小
  const size = options.radius * 0.12;
  mesh.scale.set(size, size, size);

  //注解：给这个物体添加自定义的一些数据，方便后续进行交互操作
  mesh.userData['size'] = size;
  //自定义属性scale表示mesh在原始大小基础上放大倍数  光圈在原来mesh.size基础上1~2倍之间变化
  mesh.userData['scale'] = Math.random() * 1.0;

  //注解：将经纬度坐标转化为球体坐标，并将物体放在这个位置上面
  const coord = lon2xyz(options.radius * 1.0023, options.lon, options.lat);
  mesh.position.set(coord.x, coord.y, coord.z);

  //注解：将这个平面转一下角度，使之贴近地球表面
  const coordVec3 = new Vector3(coord.x, coord.y, coord.z).normalize();
  const meshNormal = new Vector3(0, 0, 1);
  mesh.quaternion.setFromUnitVectors(meshNormal, coordVec3);

  return mesh;
}

//注解：{地球半径} R  {经度(角度值)} longitude  {维度(角度值)} latitude
export const lon2xyz = (R:number, longitude:number, latitude:number): Vector3 => {
  //转弧度值
  let lon = longitude * Math.PI / 180;
  //转弧度值
  const lat = latitude * Math.PI / 180;
  //js坐标系z坐标轴对应经度-90度，而不是90度 
  lon = -lon; 
  //经纬度坐标转球面坐标计算公式
  const x = R * Math.cos(lat) * Math.cos(lon);
  const y = R * Math.sin(lat);
  const z = R * Math.cos(lat) * Math.sin(lon);
  //返回球面坐标
  return new Vector3(x, y, z);
}

//注解：这里是将ZOX平面上以原点为圆心，半径为R的圆切割成 N 个点，将这些点首尾连接（最后一个数据等于第一个）保存起来，并返回
export const getCirclePoints = (option) => {
  const list = [];
  for (
    let j = 0;
    j < 2 * Math.PI - 0.1;
    j += (2 * Math.PI) / (option.number || 100)
  ) {
    list.push([
      parseFloat((Math.cos(j) * (option.radius || 10)).toFixed(2)),
      0,
      parseFloat((Math.sin(j) * (option.radius || 10)).toFixed(2)),
    ]);
  }
  if (option.closed) list.push(list[0]);
  return list;
}

//注解：创建圆环轨道
export const createAnimateLine = (option) => {
  //注解：由多个点数组构成的曲线，通常用于道路
  const linePoint = option.pointList.map((item: any) => new Vector3(item[0], item[1], item[2]));
  //注解：曲线路径
  const curve = new CatmullRomCurve3(linePoint);
  //注解：根据曲线路径，生成管道体
  const tubeGeometry = new TubeGeometry(
    curve,
    option.number || 50,
    option.radius || 1,
    option.radialSegments
  );
  return new Mesh(tubeGeometry, option.material);
}