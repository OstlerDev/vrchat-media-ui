
using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using VRC.SDKBase;
using VRC.SDK3.Image;
using VRC.Udon;

public class MediaItemView : UdonSharpBehaviour
{
    public TextMeshProUGUI titleText;
    public TextMeshProUGUI subtitleText;
    public RawImage posterImage;
    
    private VRCUrl _imageUrl;

    // Changed signature: imageUrlStr -> imageUrl (VRCUrl)
    public void SetContent(string title, string subtitle, VRCUrl imageUrl)
    {
        if (titleText != null) titleText.text = title;
        if (subtitleText != null) subtitleText.text = subtitle;
        
        _imageUrl = imageUrl;

        // Check if URL is valid/present
        if (_imageUrl != null)
        {
             // Attempt to download image
            VRCImageDownloader downloader = new VRCImageDownloader();
            downloader.DownloadImage(_imageUrl, null, (UdonBehaviour)this.GetComponent(typeof(UdonBehaviour)), null);
        }
    }

    public override void OnImageLoadSuccess(IVRCImageDownload result)
    {
        if (posterImage != null)
        {
            posterImage.texture = result.Result;
        }
    }

    public override void OnImageLoadError(IVRCImageDownload result)
    {
        Debug.LogError($"[MediaItemView] Failed to load image: {result.ErrorMessage}");
    }
}
