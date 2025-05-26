from flask import Flask, request, render_template, jsonify
import tensorflow as tf
import numpy as np
from PIL import Image
import io
import base64
import os

app = Flask(__name__)

# Configuración para archivos grandes
app.config['MAX_CONTENT_LENGTH'] = 64 * 1024 * 1024  # 64MB max para múltiples imágenes

# Variable global para el modelo
model = None

def load_model():
    """Carga el modelo con manejo robusto de errores"""
    global model
    model_path = 'garbageClasi.keras'
    
    if not os.path.exists(model_path):
        print(f"❌ No se encontró el archivo del modelo: {model_path}")
        return False
    
    try:
        # Intentar cargar normalmente
        model = tf.keras.models.load_model(model_path)
        print("✅ Modelo cargado exitosamente")
        return True
        
    except Exception as e:
        print(f"⚠️ Error al cargar el modelo normalmente: {e}")
        print("Intentando cargar sin compilar...")
        
        try:
            # Intentar cargar sin compilar
            model = tf.keras.models.load_model(model_path, compile=False)
            print("✅ Modelo cargado sin compilar")
            
            # Recompilar el modelo manualmente
            model.compile(
                optimizer='adam',
                loss='sparse_categorical_crossentropy',
                metrics=['accuracy']
            )
            print("✅ Modelo recompilado")
            return True
            
        except Exception as e2:
            print(f"❌ Error persistente al cargar el modelo: {e2}")
            return False

def preprocess_image(image, target_size=(224, 224)):
    """Preprocesa la imagen para el modelo"""
    try:
        # Redimensionar imagen
        image = image.resize(target_size)
        
        # Convertir a RGB si no lo está
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Convertir a array numpy
        image_array = np.array(image)
        
        # Normalizar píxeles (0-1)
        image_array = image_array.astype('float32') / 255.0
        
        return image_array
        
    except Exception as e:
        print(f"Error en preprocesamiento: {e}")
        raise

def preprocess_multiple_images(images, target_size=(224, 224)):
    """Preprocesa múltiples imágenes para el modelo"""
    processed_images = []
    
    for image in images:
        try:
            processed_img = preprocess_image(image, target_size)
            processed_images.append(processed_img)
        except Exception as e:
            print(f"Error procesando imagen: {e}")
            # Crear imagen dummy en caso de error
            dummy_img = np.zeros((target_size[0], target_size[1], 3), dtype=np.float32)
            processed_images.append(dummy_img)
    
    # Combinar todas las imágenes en un batch
    batch = np.array(processed_images)
    return batch

def determine_input_size(model):
    """Determina el tamaño de entrada correcto del modelo"""
    input_shape = model.input_shape
    
    if len(input_shape) == 4:  # (batch, height, width, channels)
        return (input_shape[1], input_shape[2])
    elif len(input_shape) == 2:  # Modelo con Flatten
        # Calcular dimensiones cuadradas
        total_pixels = input_shape[1]
        
        # Asumir imagen cuadrada en escala de grises o RGB
        if total_pixels == 20736:  # 144x144x1
            return (144, 144)
        elif total_pixels == 16384:  # 128x128x1
            return (128, 128)
        elif total_pixels == 50176:  # 224x224x1
            return (224, 224)
        elif total_pixels == 150528:  # 224x224x3
            return (224, 224)
        else:
            # Calcular tamaño cuadrado
            import math
            side = int(math.sqrt(total_pixels))
            return (side, side)
    
    # Por defecto
    return (224, 224)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    """Endpoint para predecir la clase de residuo - imagen única"""
    if model is None:
        return jsonify({'error': 'Modelo no disponible'}), 500
    
    try:
        # Verificar que se subió un archivo
        if 'file' not in request.files:
            return jsonify({'error': 'No se encontró archivo'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'error': 'No se seleccionó archivo'}), 400
        
        # Verificar que es una imagen
        if not file.content_type.startswith('image/'):
            return jsonify({'error': 'El archivo debe ser una imagen'}), 400
        
        # Leer y procesar la imagen
        image = Image.open(file.stream)
        
        # Determinar el tamaño de entrada
        target_size = determine_input_size(model)
        print(f"Redimensionando a: {target_size}")
        
        # Preprocesar imagen
        processed_image = preprocess_image(image, target_size)
        processed_image = np.expand_dims(processed_image, axis=0)  # Agregar dimensión de batch
        
        print(f"Shape de imagen procesada: {processed_image.shape}")
        
        # Hacer predicción
        prediction = model.predict(processed_image, verbose=0)
        
        # Obtener clase predicha y confianza
        predicted_class = int(np.argmax(prediction))
        confidence = float(np.max(prediction))
        
        # Nombres de clases (ajustar según tu modelo)
        class_names = [
            'Carton',
            'Vidrio', 
            'Metal',
            'Papel',
            'Plastico',
            'No Reciclable'
        ]
        
        # Verificar que el índice es válido
        if predicted_class >= len(class_names):
            class_name = f'Clase_{predicted_class}'
        else:
            class_name = class_names[predicted_class]
        
        # Preparar respuesta
        result = {
            'success': True,
            'predicted_class': predicted_class,
            'class_name': class_name,
            'confidence': confidence,
            'confidence_percentage': f"{confidence * 100:.2f}%",
            'all_predictions': prediction.tolist()
        }
        
        print(f"✅ Predicción exitosa: {class_name} ({confidence:.2%})")
        return jsonify(result)
        
    except Exception as e:
        print(f"❌ Error en predicción: {str(e)}")
        return jsonify({
            'error': f'Error al procesar imagen: {str(e)}',
            'success': False
        }), 500

@app.route('/predict_batch', methods=['POST'])
def predict_batch():
    """Endpoint para predecir múltiples imágenes en un solo request"""
    if model is None:
        return jsonify({'error': 'Modelo no disponible'}), 500
    
    try:
        # Verificar que se subieron archivos
        files = request.files.getlist('files')
        
        if not files or len(files) == 0:
            return jsonify({'error': 'No se encontraron archivos'}), 400
        
        print(f"📸 Procesando {len(files)} imágenes...")
        
        # Validar archivos y cargar imágenes
        images = []
        image_names = []
        valid_files = []
        
        for i, file in enumerate(files):
            if file.filename == '':
                continue
                
            if not file.content_type.startswith('image/'):
                print(f"⚠️ Archivo {file.filename} no es una imagen válida")
                continue
            
            try:
                image = Image.open(file.stream)
                images.append(image)
                image_names.append(file.filename)
                valid_files.append(i)
                print(f"✅ Imagen {file.filename} cargada correctamente")
            except Exception as e:
                print(f"❌ Error cargando {file.filename}: {e}")
                continue
        
        if len(images) == 0:
            return jsonify({'error': 'No se pudieron procesar las imágenes'}), 400
        
        # Determinar el tamaño de entrada
        target_size = determine_input_size(model)
        print(f"Redimensionando a: {target_size}")
        
        # Preprocesar todas las imágenes
        batch_images = preprocess_multiple_images(images, target_size)
        print(f"Batch shape: {batch_images.shape}")
        
        # Hacer predicción en batch
        predictions = model.predict(batch_images, verbose=0)
        print(f"Predicciones shape: {predictions.shape}")
        
        # Nombres de clases
        class_names = [
            'Carton',
            'Vidrio', 
            'Metal',
            'Papel',
            'Plastico',
            'No Reciclable'
        ]
        
        # Procesar resultados
        results = []
        for i, (prediction, image_name) in enumerate(zip(predictions, image_names)):
            predicted_class = int(np.argmax(prediction))
            confidence = float(np.max(prediction))
            
            # Verificar que el índice es válido
            if predicted_class >= len(class_names):
                class_name = f'Clase_{predicted_class}'
            else:
                class_name = class_names[predicted_class]
            
            result = {
                'image_index': valid_files[i],
                'image_name': image_name,
                'predicted_class': predicted_class,
                'class_name': class_name,
                'confidence': confidence,
                'confidence_percentage': f"{confidence * 100:.2f}%",
                'all_predictions': prediction.tolist()
            }
            
            results.append(result)
            print(f"✅ {image_name}: {class_name} ({confidence:.2%})")
        
        # Preparar respuesta final
        response = {
            'success': True,
            'total_images': len(results),
            'results': results,
            'processing_time': f"Procesadas {len(results)} imágenes"
        }
        
        print(f"🎉 Batch procesado exitosamente: {len(results)} imágenes")
        return jsonify(response)
        
    except Exception as e:
        print(f"❌ Error en predicción batch: {str(e)}")
        return jsonify({
            'error': f'Error al procesar imágenes: {str(e)}',
            'success': False
        }), 500

@app.route('/model_info')
def model_info():
    """Endpoint para obtener información del modelo"""
    if model is None:
        return jsonify({'error': 'Modelo no disponible'}), 500
    
    try:
        info = {
            'input_shape': model.input_shape,
            'output_shape': model.output_shape,
            'layers': len(model.layers),
            'trainable_params': model.count_params(),
            'model_loaded': True
        }
        return jsonify(info)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health')
def health_check():
    """Endpoint para verificar el estado de la aplicación"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'tensorflow_version': tf.__version__
    })

@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'Archivo demasiado grande. Máximo 64MB'}), 413

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': 'Error interno del servidor'}), 500

if __name__ == '__main__':
    print("🚀 Iniciando aplicación EcoRewards...")
    print(f"TensorFlow version: {tf.__version__}")
    
    # Cargar modelo
    if load_model():
        print(f"📊 Información del modelo:")
        print(f"   - Input shape: {model.input_shape}")
        print(f"   - Output shape: {model.output_shape}")
        print(f"   - Parámetros: {model.count_params():,}")
        
        # Iniciar aplicación
        app.run(debug=True, host='0.0.0.0', port=5000)
    else:
        print("❌ No se pudo cargar el modelo. Verifica que 'garbageClasi.keras' exists.")
        exit(1)