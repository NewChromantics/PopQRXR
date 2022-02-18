attribute vec3 LocalPosition;
attribute vec3 LocalUv;
attribute vec3 LocalNormal;
varying vec3 FragWorldPosition;
varying vec3 FragLocalPosition;
varying vec2 FragLocalUv;
varying vec3 FragLocalNormal;
varying vec3 FragWorldNormal;

varying vec3 FragCameraPosition;	//	position in camera space
varying vec2 FragViewUv;
varying vec3 ClipPosition;
varying float TriangleIndex;
varying vec3 FragColour;

uniform mat4 LocalToWorldTransform;
uniform mat4 WorldToCameraTransform;
uniform mat4 CameraProjectionTransform;
attribute vec3 Colour;

void main()
{
	float3 LocalPos = LocalPosition;
	
	float4 WorldPos = LocalToWorldTransform * float4(LocalPos,1);
	
	float4 CameraPos = WorldToCameraTransform * WorldPos;	//	world to camera space
	float4 ProjectionPos = CameraProjectionTransform * CameraPos;

	vec4 WorldNormal = LocalToWorldTransform * vec4(LocalNormal,0.0);
	WorldNormal.xyz = normalize(WorldNormal.xyz);

	gl_Position = ProjectionPos;
	
	FragViewUv = gl_Position.xy;
	ClipPosition = gl_Position.xyz / gl_Position.www;	//	not sure if this should divide...
	
	FragCameraPosition = CameraPos.xyz ;/// CameraPos.www;
	
	FragWorldPosition = WorldPos.xyz;
	//FragColour = Colour;//LocalPosition;
	FragColour = float3( LocalUv );
	FragLocalPosition = LocalPosition;
	FragLocalUv = LocalUv.xy;
	TriangleIndex = LocalUv.z;
	FragColour = Colour;
	FragLocalNormal = LocalNormal;
	FragWorldNormal = WorldNormal.xyz;
}

