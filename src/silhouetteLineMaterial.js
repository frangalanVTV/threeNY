import { LDrawConditionalLineMaterial } from "three/addons/materials/LDrawConditionalLineMaterial.js";

/**
 * LDrawConditionalLineMaterial with a view-space silhouette test.
 *
 * The stock shader decides in projected screen space, which breaks down
 * for segments that extend behind the camera (w <= 0): a long pipe running
 * past the viewer would draw every facet instead of just its outline.
 *
 * Here the test is done in view space, where it is exact for any camera
 * position: draw the edge only if both adjacent faces' opposite vertices
 * (control0/control1) lie on the same side of the plane through the eye
 * and the edge — i.e. one face is front-facing and the other back-facing.
 * vectorExport.js runs the identical test on the CPU, so screen and SVG
 * always agree.
 */
export class SilhouetteLineMaterial extends LDrawConditionalLineMaterial {
  constructor(parameters) {
    super(parameters);
    this.vertexShader = /* glsl */ `
      attribute vec3 control0;
      attribute vec3 control1;
      attribute vec3 direction;
      varying float discardFlag;

      #include <common>
      #include <color_pars_vertex>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      #include <clipping_planes_pars_vertex>
      void main() {
        #include <color_vertex>

        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;

        // position + direction lies on the same edge line for both of the
        // segment's vertices, so this is the same plane for both.
        vec3 a = mvPosition.xyz;
        vec3 b = ( modelViewMatrix * vec4( position + direction, 1.0 ) ).xyz;
        vec3 c0 = ( modelViewMatrix * vec4( control0, 1.0 ) ).xyz;
        vec3 c1 = ( modelViewMatrix * vec4( control1, 1.0 ) ).xyz;
        vec3 n = cross( a, b );
        discardFlag = float( sign( dot( n, c0 ) ) != sign( dot( n, c1 ) ) );

        #include <logdepthbuf_vertex>
        #include <clipping_planes_vertex>
        #include <fog_vertex>
      }
    `;
  }
}
