using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using VRC.SDKBase;
using VRC.Udon;

[UdonBehaviourSyncMode(BehaviourSyncMode.None)]
public class MediaItemView : UdonSharpBehaviour
{
    [Header("UI Components")]
    public TextMeshProUGUI titleText;
    public TextMeshProUGUI subtitleText;
    public RawImage posterImage;
    public Button clickButton; // Explicit reference to the button

    private int _actionSlotId = -1;
    private MediaGridManager _gridManager;

    void Start()
    {
        // Verify we found one
        if (clickButton == null)
        {
            Debug.LogError($"[MediaItemView] {gameObject.name}:  entity not found! This item will not be clickable. Trying to find one...");

            // Only log error if we don't have a collider either (could be 3D interact)
            if (GetComponent<Collider>() == null)
            {
                Debug.LogError($"[MediaItemView] {gameObject.name}: Missing Button Component! This item will not be clickable.");
            }
        }
    }

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
        // Debug.Log($"[MediaItemView] Action configured for slot {slotId}");
    }

    public void OnClick()
    {
        Debug.Log($"[MediaItemView] OnClick triggered for slot {_actionSlotId}");
        
        if (_gridManager != null && _actionSlotId >= 0)
        {
            _gridManager.OnItemClicked(_actionSlotId);
        }
        else
        {
            Debug.LogWarning($"[MediaItemView] Click ignored. Manager: {(_gridManager != null ? "OK" : "NULL")}, Slot: {_actionSlotId}");
        }
    }

    public override void Interact()
    {
        OnClick();
    }
}
