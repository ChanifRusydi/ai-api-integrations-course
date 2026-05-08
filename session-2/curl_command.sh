#!/bin/bash
BASE_URL="http://localhost:3000"

status() {
    echo "[GET] /status"
    curl -X GET "$BASE_URL/status"
}

generate_text() {
    echo "[POST] /generate-text (Sending a prompt)"
    curl -X POST "$BASE_URL/generate-text" \
         -H "Content-Type: application/json" \
         -d '{"prompt": "Tell me a fun fact about Node.js"}'
}

generate_from_image() {
    # Provide a default image path, or let the user pass it as $2
        IMAGE_PATH=${2:-"./asset/image.jpg"} 
    
        if [ ! -f "$IMAGE_PATH" ]; then
            echo "❌ Error: File not found at $IMAGE_PATH"
            exit 1
        fi
    
        echo "[POST] /generate-from-image (Uploading $IMAGE_PATH)"
        curl -X POST "$BASE_URL/generate-from-image" \
             -F "image=@$IMAGE_PATH" \
             -F "prompt=Describe this image"
}

generate_from_document() {
    # Provide a default image path, or let the user pass it as $2
        DOCUMENT_PATH=${2:-"./asset/Spam_filter_LLM.pdf"} 
    
        if [ ! -f "$DOCUMENT_PATH" ]; then
            echo "❌ Error: File not found at $DOCUMENT_PATH"
            exit 1
        fi

        echo "[POST] /generate-from-document (Uploading $DOCUMENT_PATH)"
        curl -X POST "$BASE_URL/generate-from-document" \
             -F "document=@$DOCUMENT_PATH" \
             -F "prompt=Describe this image"
}
generate_from_audio() {
    # Provide a default audio path, or let the user pass it as $2
        AUDIO_PATH=${2:-"./asset/AI_Podcast_cut.mp3"} 
    
        if [ ! -f "$AUDIO_PATH" ]; then
            echo "❌ Error: File not found at $AUDIO_PATH"
            exit 1
        fi
    
        echo "[POST] /generate-from-audio (Uploading $AUDIO_PATH)"
        curl -X POST "$BASE_URL/generate-from-audio" \
             -F "audio=@$AUDIO_PATH;type=audio/mpeg" \
             -F "prompt=Transcribe this document"
}
# ==========================================
# 2. Handle Command Line Arguments ($1)
# ==========================================

# If no argument is provided, show usage instructions
if [ -z "$1" ]; then
    echo "❌ Error: No endpoint specified."
    echo ""
    echo "Usage: ./test-api.sh [command]"
    echo ""
    echo "Available commands:"
    echo "  status   - Test the GET /status endpoint"
    echo "  prompt   - Test the POST /your-endpoint endpoint"
    echo "  search   - Test the GET /search endpoint"
    echo "  update   - Test the PUT /items/1 endpoint"
    echo "  delete   - Test the DELETE /items/1 endpoint"
    echo "  all      - Run all tests sequentially"
    exit 1
fi

echo "========================================="
echo "🚀 Testing against $BASE_URL"
echo "========================================="
echo ""

# The case statement reads the first argument ($1)
case "$1" in
    "status")
        status
        ;;
    "generate-text")
        generate_text
        ;;
    "generate-from-image")
        generate_from_image "$@" # "$@" passes all arguments so $2 works
        ;;
    "generate-from-document")
        generate_from_document "$@"
        ;;
    "generate-from-audio")
        generate_from_audio "$@"
        ;;
    "all")
        status
        generate_text
        generate_from_image
        generate_from_document
        generate_from_audio
        echo "✅ All tests completed!"
        ;;
    *)
        # Catch-all for invalid arguments
        echo "❌ Invalid command: '$1'"
        echo "Use './test-api.sh' without arguments to see available commands."
        exit 1
        ;;
esac
