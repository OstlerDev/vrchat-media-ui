
using UnityEngine;
using UnityEditor;
using VRC.SDKBase;
using System.Collections.Generic;

[CustomEditor(typeof(APIManager))]
public class APIManagerEditor : Editor
{
    public override void OnInspectorGUI()
    {
        DrawDefaultInspector();

        APIManager manager = (APIManager)target;

        EditorGUILayout.Space();
        EditorGUILayout.LabelField("URL Generator", EditorStyles.boldLabel);
        
        GUILayout.BeginVertical("box");
        GUILayout.Label("Generator Settings (Not saved to component)", EditorStyles.boldLabel);
        
        string serviceUrl = EditorGUILayout.TextField("Service URL", "http://localhost:4000");
        int slotCount = EditorGUILayout.IntField("Slot Count", 100);
        
        if (GUILayout.Button("Generate All URLs (API & Images)"))
        {
            GenerateAllUrls(manager, serviceUrl, slotCount);
        }
        GUILayout.EndVertical();
    }

    void GenerateAllUrls(APIManager manager, string serviceUrl, int count)
    {
        if (string.IsNullOrEmpty(serviceUrl))
        {
            Debug.LogError("Service URL cannot be empty.");
            return;
        }

        string baseService = serviceUrl.TrimEnd('/');

        // 1. Generate Home URL
        manager.homeUrl = new VRCUrl(baseService + "/api/ui/home");

        // 2. Generate API Slot URLs
        List<VRCUrl> apiUrls = new List<VRCUrl>();
        for (int i = 0; i < count; i++)
        {
            string url = $"{baseService}/api/ui/slots/{i}";
            apiUrls.Add(new VRCUrl(url));
        }
        manager.slotUrls = apiUrls.ToArray();

        // 3. Generate Image Slot URLs
        List<VRCUrl> imgUrls = new List<VRCUrl>();
        for (int i = 0; i < count; i++)
        {
            string url = $"{baseService}/imgs/slots/{i}.jpg";
            imgUrls.Add(new VRCUrl(url));
        }
        manager.imageSlotUrls = imgUrls.ToArray();
        
        EditorUtility.SetDirty(manager);
        Debug.Log($"Generated Home URL, {apiUrls.Count} API slots, and {imgUrls.Count} Image slots.");
    }
}
