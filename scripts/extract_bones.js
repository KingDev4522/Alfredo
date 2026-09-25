import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * PHASE 0: Data Extraction Script
 * Extracts and prints all bone names from the human.glb avatar
 * to build the BONE_MAP for the IK solver later.
 */
function extractBones() {
  const loader = new GLTFLoader();
  const avatarPath = '../public/avatar/human.glb'; // Adjust path if running from HTML
  
  console.log(`Loading avatar from ${avatarPath}...`);
  
  loader.load(
    avatarPath,
    (gltf) => {
      console.log('Avatar loaded successfully.');
      const bones = [];
      
      gltf.scene.traverse((object) => {
        if (object.isBone) {
          bones.push(object.name);
          console.log(`Found bone: ${object.name}`);
        }
      });
      
      console.log('\n--- COMPLETE BONE LIST ---');
      console.log(JSON.stringify(bones, null, 2));
    },
    (xhr) => {
      console.log(`${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`);
    },
    (error) => {
      console.error('An error happened while loading the avatar:', error);
    }
  );
}

// Ensure it runs in a browser context (or via a bundler)
if (typeof window !== 'undefined') {
  extractBones();
}
