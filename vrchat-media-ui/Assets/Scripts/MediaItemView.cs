
using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using VRC.SDKBase;
using VRC.Udon;

public class MediaItemView : UdonSharpBehaviour
{
    public TextMeshProUGUI titleText;
    public TextMeshProUGUI subtitleText;
    public RawImage posterImage;

    private int _actionSlotId = -1;
    private MediaGridManager _gridManager;

    public void SetContent(string title, string subtitle)
    {
        if (titleText != null) titleText.text = title;
        if (subtitleText != null) subtitleText.text = subtitle;
    }

    public void SetImage(Texture2D texture, Rect uvRect)
    {
        if (posterImage != null)
        {
            posterImage.texture = texture;
            posterImage.uvRect = uvRect;
        }
    }

    public void SetAction(int slotId, MediaGridManager gridManager)
    {
        _actionSlotId = slotId;
        _gridManager = gridManager;
    }

    public void OnClick()
    {
        if (_gridManager != null && _actionSlotId >= 0)
        {
            _gridManager.OnItemClicked(_actionSlotId);
        }
    }
}
