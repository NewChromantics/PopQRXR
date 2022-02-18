precision highp float;
varying vec3 FragColour;

uniform bool MuteColour;
uniform bool InvertColour;

uniform sampler2D DepthTexture;
uniform mat4 NormalDepthToViewDepthTransform;
uniform mat4 CameraToWorldTransform;
uniform mat4 ProjectionToCameraTransform;

varying vec3 FragWorldPosition;
varying vec2 FragLocalUv;
varying vec2 FragViewUv;
varying vec3 ClipPosition;
varying vec3 FragWorldNormal;

varying vec3 FragCameraPosition;

const float ValueToMetres = 0.0010000000474974513;

float GetViewDepth()
{
	//	view uv (-1...1) to 0...1
	vec2 UvNormalised = (FragViewUv + 1.0) / 2.0;

	//	texture is rotated
	//	would be nice to fix this in upload, but really should be part of the transform
	//UvNormalised = vec2( 1.0-UvNormalised.y, 1.0-UvNormalised.x );
	UvNormalised = vec2( UvNormalised.x, 1.0 - UvNormalised.y );

	//	gr: I think this is correct - do a projection correction for screen->depth texture
	//		to get proper coords
	vec4 DepthUv4 = NormalDepthToViewDepthTransform * vec4( UvNormalised, 0.0, 1.0 );
	vec2 DepthUv = DepthUv4.xy;

	
	float Depth = texture2D( DepthTexture, DepthUv ).x;
	Depth *= ValueToMetres;
	return Depth;
}


vec3 GetSceneCameraPosition()
{
	//	depth in viewport space so 0...1, leave it at that
	vec2 xy = ClipPosition.xy;
	vec2 uv = (xy + 1.0 ) / 2.0;	//	0...1
	
	//	this depth needs to be normalised to be in camera projection space...
	//float Depth = texture2D(SceneDepthTexture, uv).x;	//	already 0...1
	float Depth = 1.0;

	vec3 xyz = mix( vec3(-1,-1,-1), vec3(1,1,1), vec3(uv,Depth) );
	vec4 ProjectionPos = vec4( xyz, 1 );
	
	vec4 CameraPos = ProjectionToCameraTransform * ProjectionPos;
	vec3 CameraPos3 = CameraPos.xyz / CameraPos.www;
	
	//	CameraPos3 is end of ray
	float ViewDepthMetres = GetViewDepth();
	CameraPos3 = normalize(CameraPos3);
	CameraPos3 *= ViewDepthMetres;
	
	return CameraPos3;
}

vec3 GetSceneWorldPosition()
{
	vec3 CameraPos = GetSceneCameraPosition();
	vec4 WorldPos = CameraToWorldTransform * vec4(CameraPos,1);
	vec3 WorldPos3 = WorldPos.xyz / WorldPos.www;
	return WorldPos3;
}


float Range(float Min,float Max,float Value)
{
	return (Value-Min) / (Max-Min);
}

float Range01(float Min,float Max,float Value)
{
	return clamp( Range( Min, Max, Value ), 0.0, 1.0 );
}

float PhongLightFactor()
{
	//	Y is backwards here...
	vec3 LightWorldPosition = vec3(1,10,0);
	
	vec3 DirToLight = normalize(LightWorldPosition - FragWorldPosition);
	float Dot = dot( FragWorldNormal, DirToLight );
	Dot = Range( -1.0, 1.0, Dot );
	return Dot;
}

vec3 ApplyLighting(vec3 Colour)
{
	float Light = PhongLightFactor();
	float Shadow = 0.0;//GetOccupancyMapShadowFactor( FragWorldPosition );

	Light *= 1.0 - Shadow;

	vec3 DarkColour = Colour - vec3(0.5);	
	vec3 LightColour = Colour + vec3(0.5);
	Colour = mix( DarkColour, LightColour, Light );	
	return Colour;
}


void main()
{
	gl_FragColor.w = 1.0;
	gl_FragColor.xyz = ApplyLighting( FragColour.xyz );
}


