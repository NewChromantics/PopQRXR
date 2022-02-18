import Pop from './PopEngine/PopEngine.js'
import FrameCounter_t from './PopEngine/FrameCounter.js'

import Camera_t from './PopEngine/Camera.js'
import AssetManager from './PopEngine/AssetManager.js'
import {CreateCubeGeometry} from './PopEngine/CommonGeometry.js'
import {CreateTranslationMatrix,Add3,Subtract3,Multiply3} from './PopEngine/Math.js'
import {CreateRandomImage} from './PopEngine/Images.js'
import {GetRandomColour} from './PopEngine/Colour.js'
import {Dot3,lerp,LengthSq3} from './PopEngine/Math.js'
import PromiseQueue from './PopEngine/PromiseQueue.js'

let AppCamera = new Camera_t();
//	try and emulate default XR pose a bit
AppCamera.Position = [0,0,0];
AppCamera.LookAt = [0,0,-1];
let LastXrRenderTimeMs = null;
let DefaultDepthTexture = CreateRandomImage(16,16);
let CubeSize = 0.05;
let CubeColour = GetRandomColour();
let CubeLocalToWorldTransform = [1,0,0,0,	0,1,0,0,	0,0,1,0,	AppCamera.LookAt.slice(),1];

//	callback if tracking image found
function OnTrackedImage(LocalToWorld)
{
	CubesLocalToWorldTransform = LocalToWorld;
}

async function CreateUnitCubeTriangleBuffer(RenderContext)
{
	const Geometry = CreateCubeGeometry(-CubeSize,CubeSize);
	const TriangleIndexes = undefined;
	const TriBuffer = await RenderContext.CreateGeometry(Geometry,TriangleIndexes);
	return TriBuffer;
}


let CubeShader = null;
function RegisterAssets()
{
	if ( CubeShader )
		return;
	AssetManager.RegisterAssetAsyncFetchFunction('Cube01', CreateUnitCubeTriangleBuffer );


	const Attribs = ['LocalPosition','LocalUv'];
	const VertFilename = 'Geo.vert.glsl';
	const FragFilename = 'Colour.frag.glsl';
	CubeShader = AssetManager.RegisterShaderAssetFilename(FragFilename,VertFilename,null,Attribs);
}



function GetSceneRenderCommands(RenderContext,Camera,Viewport=[0,0,1,1])
{
	//	make screen camera track xr camera
	AppCamera.Position = Camera.Position.slice();
	AppCamera.LookAt = Camera.LookAt.slice();
	
	RegisterAssets();
	
	const ClearCommand = ['SetRenderTarget',null,[0.1,0.1,0.1]];
			
	//	normalise viewport
	Viewport[0] = 0;
	Viewport[1] = 0;
	Viewport[3] /= Viewport[2];
	Viewport[2] /= Viewport[2];

	let InFrontMetres = 1.0;
	let Forward = Multiply3( Camera.GetForward(), [InFrontMetres,InFrontMetres,InFrontMetres] );
	let CubePosition = Add3( Camera.Position, Forward );

	//	todo; store distance from camera?... use w? and a version?...or map once and sort?
	const CameraPos = AppCamera.Position;
	function CompareNearCamera(a,b)
	{
		const Dista = LengthSq3(a,CameraPos);
		const Distb = LengthSq3(b,CameraPos);
		if ( Dista < Distb )	return 1;
		if ( Dista > Distb )	return -1;
		return 0;
	}
	//WorldPositions.sort(CompareNearCamera);

	const Geo = AssetManager.GetAsset('Cube01',RenderContext);
	const Shader = AssetManager.GetAsset(CubeShader,RenderContext);
	const Uniforms = {};
	Uniforms.LocalToWorldTransform = CubeLocalToWorldTransform;
	Uniforms.Colour = CubeColour;
	Uniforms.WorldToCameraTransform = Camera.GetWorldToCameraMatrix();
	Uniforms.CameraToWorldTransform = Camera.GetLocalToWorldMatrix();
	Uniforms.CameraProjectionTransform = Camera.GetProjectionMatrix(Viewport);
	Uniforms.DepthTexture = Camera.DepthImage || DefaultDepthTexture;
	Uniforms.NormalDepthToViewDepthTransform = Uniforms.DepthTexture.NormalDepthToViewDepthTransform || [];
	
	const State = {};
	State.BlendMode = 'Alpha';
	State.BlendMode = 'Blit';
	//State.DepthRead = false;
	
	const DrawCube = ['Draw',Geo,Shader,Uniforms,State];
	/*
	const Uniforms2 = Object.assign({},Uniforms);
	Uniforms2.LocalToWorldTransform = CreateTranslationMatrix( CubePosition[0]+1, CubePosition[1], CubePosition[2] );
	Uniforms2.Colour = [0,1,0];
	const DrawCube2 = ['Draw',Geo,Shader,Uniforms2];
	*/
	
	return [ClearCommand,DrawCube/*,DrawCube2*/];
}

function GetXrRenderCommands()
{
	LastXrRenderTimeMs = Pop.GetTimeNowMs();
	return GetSceneRenderCommands(...arguments);
}

async function GetMainRenderCommands(RenderView,RenderContext)
{
	let Camera = AppCamera;

	try
	{
		const Viewport = RenderView.GetScreenRect();
		const Commands = GetSceneRenderCommands(RenderContext,Camera,Viewport);
		return Commands;
	}
	catch(e)
	{
		console.error(e);
		const ClearRed = ['SetRenderTarget',null,[1,0,0]];
		return [ClearRed];
	}
}



async function XrLoop(RenderContext,XrOnWaitForCallback,OnStarted)
{
	const FrameCounter = new FrameCounter_t(`XR frame`);
	function OnXrRender()
	{
		FrameCounter.Add();
	}
	
	const CatJpg = await Pop.FileSystem.LoadFileAsImageAsync('Cat.jpg');
	const TrackedImages = {};
	TrackedImages.Cat =
	{
		Image:CatJpg,
		WidthMetres:0.10,
	};

	while ( true )
	{
		try
		{
			LastXrRenderTimeMs = null;
			const Device = await Pop.Xr.CreateDevice( RenderContext, GetXrRenderCommands, XrOnWaitForCallback, TrackedImages );
			
			async function WaitForTrackedImageThread()
			{
				while(true)
				{
					const ImageLocalToWorld = await Device.WaitForTrackedImage();
					OnTrackedImage(ImageLocalToWorld);
					
					//	this was thrashing xr and getting stuck
					await Pop.Yield(1*1000);
				}
			}
			WaitForTrackedImageThread().catch(console.error);
			
			if ( OnStarted )
				OnStarted(Device);
			
			await Device.WaitForEnd();
		}
		catch(e)
		{
			console.error(`Failed to create xr ${e}`);
			await Pop.Yield(1*1000);
		}
	}
}

function BindMouseCameraControls(Camera,RenderView)
{
	RenderView.OnMouseDown = function(x,y,Button,FirstDown=true)
	{
		if ( Button == 'Left' )
			Camera.OnCameraOrbit( x, y, 0, FirstDown!=false );
		if ( Button == 'Right' )
			Camera.OnCameraPan( x, y, 0, FirstDown!=false );
	}
	
	RenderView.OnMouseMove = function(x,y,Button)
	{
		RenderView.OnMouseDown( x, y, Button, false );
	}
	
	RenderView.OnMouseScroll = function(x,y,Button,Delta)
	{
		Camera.OnCameraZoom( -Delta[1] * 0.1 );
	}
}

async function RenderLoop(Canvas,XrOnWaitForCallback,OnRenderContext)
{
	const RenderView = new Pop.Gui.RenderView(null,Canvas);
	const RenderContext = new Pop.Sokol.Context(RenderView);
	
	if ( OnRenderContext )
		OnRenderContext(RenderContext);

	BindMouseCameraControls( AppCamera, RenderView );
	
	if ( XrOnWaitForCallback )
		XrLoop(RenderContext,XrOnWaitForCallback).catch(console.error);
	
	const FrameCounter = new FrameCounter_t(`Render`);
	
	while ( RenderView )
	{
		const Commands = await GetMainRenderCommands(RenderView,RenderContext);
		await RenderContext.Render(Commands);
		FrameCounter.Add();

		//	only intermediately render if xr is running
		//	todo: check time since render and "turn on" again if we havent XR rendered for a while
		if ( LastXrRenderTimeMs )
			await Pop.Yield(10*1000);
	}
}


//	is native api Pop.Media.Source?
export class WebCamera
{
	constructor()
	{
		this.FrameQueue = new PromiseQueue();
		this.CameraThreadPromise = this.CameraThread();
		this.CameraThreadPromise.catch( this.OnError.bind(this) );
	}
	
	OnError(Error)
	{
		this.FrameQueue.Reject(Error);
	}
	
	async CameraThread()
	{
		if ( !navigator.mediaDevices )
			throw `MediaDevices not availible`;
		
		//	some old implementation
		//	https://github.com/SoylentGraham/PopEngineOldData/blob/7c6ffc1398fe735065ab4208729c9140de558e05/Data_Posenet/index.html#L385
		const Constraints = {}
		Constraints.video = {};
		//	get rear camera on android
		Constraints.video.facingMode = "environment";
		
		const Stream = await navigator.mediaDevices.getUserMedia(Constraints);

		const VideoLoadedMetaPromise = Pop.CreatePromise();
		function OnLoaded()
		{
			VideoLoadedMetaPromise.Resolve();
		}

		const VideoElement = document.createElement('video');
		//document.body.appendChild(VideoElement);
		VideoElement.srcObject = Stream;
		VideoElement.autoplay = true;
		VideoElement.onloadedmetadata = OnLoaded;
		await VideoLoadedMetaPromise;

		const Frame = {};
		//Frame.Image = Stream;
		Frame.Image = VideoElement;
		Frame.Meta = {};
		Frame.Meta.Width = VideoElement.videoWidth;
		Frame.Meta.Height = VideoElement.videoHeight;

		while ( true )
		{
			//	todo: get frames, but lets see if barcode detector works with a stream...
			//this.FrameQueue.Push(VideoElement);
			this.FrameQueue.Push(Frame);
			//	todo: get framerate
			await Pop.Yield(1000/30);
		}
	}
	
	async WaitForNextFrame(SkipToLatest=false)
	{
		if ( SkipToLatest )
			return this.FrameQueue.WaitForLatest();
		else
			return this.FrameQueue.WaitForNext();
	}
}


async function WaitForQRCode()
{
	const Options = {};
	Options.formats = ['qr_code'];
	const Detector = new BarcodeDetector(Options);
	const Camera = new WebCamera();

	while(true)
	{
		const Frame = await Camera.WaitForNextFrame(true);
		
		function PxToUv(xy)
		{
			let u = xy.x / Frame.Meta.Width;
			let v = xy.y / Frame.Meta.Height;
			return [u,v];
		}
		
		const Markers = await Detector.detect(Frame.Image);
		if ( Markers.length )
		{
			const Marker = Markers[0];
			//	get uvs
			const Value = Marker.rawValue;//"http://en.m.wikipedia.org"
			const Uvs = Marker.cornerPoints.map( PxToUv );
			console.log(`Found ${Marker.format} ${Value} at ${Uvs}`);
			return Uvs;
		}
	}
}
		

export default async function Bootup(XrOnWaitForCallback)
{
	//await RenderLoop('Window',XrOnWaitForCallback);
	
	let RenderContext;
	function OnRenderContextCreated(rc)
	{
		RenderContext = rc;
	}
	const RenderThread = RenderLoop('Window',null,OnRenderContextCreated);
	
	const QrCode = await WaitForQRCode();
	
	function OnXrStarted(Device)
	{
		//	turn the 2D QR code into an anchor in xr
		console.log(`xr started, do something with QR code uvs`);
	}
	
	//	create xr session
	await XrLoop(RenderContext,XrOnWaitForCallback,OnXrStarted);
}
