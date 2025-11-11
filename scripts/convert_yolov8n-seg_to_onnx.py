#!/usr/bin/env python3
"""
Script to convert YOLO pothole segmentation model to ONNX format using ultralytics.
This script uses the ultralytics YOLO library which handles all the conversion complexity.
"""

import sys
from pathlib import Path

try:
    from ultralytics import YOLO
except ImportError:
    print("Error: ultralytics package not found.")
    print("Please install it with: pip install ultralytics")
    sys.exit(1)


def convert_yolo_to_onnx(model_path, output_path=None, imgsz=640, simplify=False, opset=17):
    """
    Converts a YOLO PyTorch model to ONNX format using ultralytics.
    
    Args:
        model_path: Path to the YOLO .pt model file
        output_path: Path to save the ONNX model (optional, auto-generated if not provided)
        imgsz: Image size for the model (default: 640)
        simplify: Whether to simplify the ONNX model (default: True)
        opset: ONNX opset version (default: 17)
    
    Returns:
        Path to the exported ONNX model
    """
    print("=" * 60)
    print("YOLO to ONNX Converter for Pothole Segmentation Model")
    print("=" * 60)
    print(f"\nLoading YOLO model from: {model_path}")
    
    # Check if model file exists
    if not Path(model_path).exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")
    
    # Load the YOLO model
    try:
        model = YOLO(model_path)
        print("✓ Model loaded successfully!")
        
        # Print model info
        print(f"\nModel Information:")
        print(f"  Type: {type(model.model).__name__ if hasattr(model, 'model') else 'YOLO'}")
        if hasattr(model, 'names'):
            print(f"  Classes: {len(model.names)} classes")
            print(f"  Class names: {list(model.names.values())[:5]}..." if len(model.names) > 5 else f"  Class names: {list(model.names.values())}")
        
    except Exception as e:
        raise RuntimeError(f"Failed to load YOLO model: {e}")
    
    # Export to ONNX
    print(f"\nExporting to ONNX format...")
    print(f"  Image size: {imgsz}")
    print(f"  Opset version: {opset}")
    print(f"  Simplify: {simplify}")
    
    try:
        # Use YOLO's built-in export method
        # This handles all the complexity of ONNX conversion
        exported_path = model.export(
            format='onnx',
            imgsz=imgsz,
            simplify=simplify,
            opset=opset,
            nms=True,
            dynamic=False,  # Set to True if you need dynamic batch/input sizes
        )
        
        # If output_path is specified and different, move/rename the file
        if output_path and str(exported_path) != str(output_path):
            import shutil
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(exported_path), str(output_path))
            exported_path = output_path
        
        print(f"\n✓ Successfully exported model to: {exported_path}")
        
        # Verify the ONNX model
        try:
            import onnx
            onnx_model = onnx.load(str(exported_path))
            onnx.checker.check_model(onnx_model)
            print("✓ ONNX model verification passed!")
            
            # Print model info
            print(f"\nONNX Model Info:")
            print(f"  Inputs: {[input.name for input in onnx_model.graph.input]}")
            print(f"  Outputs: {[output.name for output in onnx_model.graph.output]}")
            for input in onnx_model.graph.input:
                shape = [dim.dim_value if dim.dim_value > 0 else dim.dim_param 
                        for dim in input.type.tensor_type.shape.dim]
                print(f"    {input.name}: {shape}")
            for output in onnx_model.graph.output:
                shape = [dim.dim_value if dim.dim_value > 0 else dim.dim_param 
                        for dim in output.type.tensor_type.shape.dim]
                print(f"    {output.name}: {shape}")
                
        except ImportError:
            print("Warning: onnx package not installed. Skipping verification.")
            print("  Install with: pip install onnx")
        except Exception as e:
            print(f"Warning: ONNX verification failed: {e}")
        
        return exported_path
        
    except Exception as e:
        raise RuntimeError(f"Failed to export model to ONNX: {e}")


def main():
    """Main conversion function."""
    # Default paths
    script_dir = Path(__file__).parent.parent
    model_path = script_dir / "public" / "models" / "yolov8n-seg-pothole.pt"
    output_path = script_dir / "public" / "models" / "yolov8n-seg-pothole.onnx"
    
    # Allow command line arguments
    if len(sys.argv) > 1:
        model_path = Path(sys.argv[1])
    if len(sys.argv) > 2:
        output_path = Path(sys.argv[2])
    
    try:
        # Convert model
        exported_path = convert_yolo_to_onnx(
            model_path=str(model_path),
            output_path=str(output_path),
            imgsz=640,      # Image size - adjust if your model uses different size
            simplify=True,  # Simplify ONNX graph for better compatibility
            opset=17        # ONNX opset version (17 is widely supported)
        )
        
        print("\n" + "=" * 60)
        print("Conversion completed successfully!")
        print(f"ONNX model saved to: {exported_path}")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        print("\nTroubleshooting tips:")
        print("1. Ensure ultralytics is installed: pip install ultralytics")
        print("2. Check that the model file is a valid YOLO checkpoint (.pt file)")
        print("3. Verify the model path is correct")
        print("4. For segmentation models, ensure you're using a YOLO segmentation model")
        sys.exit(1)


if __name__ == "__main__":
    main()

